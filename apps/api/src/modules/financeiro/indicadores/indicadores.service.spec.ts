import type { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ContratosSalaCobrancaService } from '../../gestao-profissionais/salas/contratos-sala-cobranca.service';
import {
  IndicadoresFinanceirosService,
  limitesDoMes,
  mesAnteriorDe,
  somarReceber,
} from './indicadores.service';
import { Prisma } from '../../../generated/prisma/client';

const ID_RECORRENTE = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

/**
 * `receber`: somas de `contaReceber` (faturamento e recorrente da base competência);
 * `baixas`: somas de `contaReceberBaixa` (recebido e, na base caixa, também o faturamento).
 */
function setup(somas: { receber: number[]; baixas?: number[]; pagar: number }) {
  const fila = [...somas.receber];
  const contaReceber = {
    aggregate: jest.fn().mockImplementation(() => {
      const valor = fila.shift() ?? 0;
      return Promise.resolve({ _sum: { valor } });
    }),
  };
  const filaBaixas = [...(somas.baixas ?? [])];
  const contaReceberBaixa = {
    aggregate: jest.fn().mockImplementation(() => {
      const valorRecebido = filaBaixas.shift() ?? 0;
      return Promise.resolve({ _sum: { valorRecebido } });
    }),
  };
  const contaPagarBaixa = {
    aggregate: jest.fn().mockResolvedValue({ _sum: { valorPago: somas.pagar } }),
  };
  const txHost = {
    tx: { contaReceber, contaReceberBaixa, contaPagarBaixa },
  } as unknown as TransactionHost<PrismaAdapter>;
  const cobrancas = { idsContasReceberDasCobrancas: jest.fn().mockResolvedValue([ID_RECORRENTE]) };
  const service = new IndicadoresFinanceirosService(
    txHost,
    cobrancas as unknown as ContratosSalaCobrancaService,
  );
  return { service, contaReceber, contaReceberBaixa, contaPagarBaixa, cobrancas };
}

describe('IndicadoresFinanceirosService', () => {
  it('mesAnteriorDe vira o ano em janeiro', () => {
    expect(mesAnteriorDe('2026-10')).toBe('2026-09');
    expect(mesAnteriorDe('2026-01')).toBe('2025-12');
  });

  it('limitesDoMes cobre meses de 28 a 31 dias e rejeita mês inválido', () => {
    expect(limitesDoMes('2026-02')).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
    expect(limitesDoMes('2026-10')).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
    expect(() => limitesDoMes('2026-1')).toThrow();
  });

  it('calcular: faturamento, recorrente, avulsa, despesas e resultado (recebido - despesas)', async () => {
    // Competência: faturamento e recorrente pelos títulos; recebido pelas baixas.
    const { service, contaReceber, contaReceberBaixa, cobrancas } = setup({
      receber: [9070, 7910],
      baixas: [9070],
      pagar: 6978.25,
    });

    const r = await service.calcular('2026-10-01', '2026-10-31', 'competencia');

    expect(r).toEqual({
      faturamentoTotal: 9070,
      receitaRecorrente: 7910,
      receitaAvulsa: 1160,
      resultadoOperacional: 2091.75,
      despesasPagas: 6978.25,
    });
    expect(cobrancas.idsContasReceberDasCobrancas).toHaveBeenCalledWith('2026-10', '2026-10');
    expect(contaReceber.aggregate).toHaveBeenCalledTimes(2);
    expect(contaReceberBaixa.aggregate).toHaveBeenCalledTimes(1);
  });

  it('calcular: só do Torres (sem receita de profissional), sem canceladas nem renegociadas na competência', async () => {
    const { service, contaReceber } = setup({ receber: [0, 0], baixas: [0], pagar: 0 });

    await service.calcular('2026-10-01', '2026-10-31', 'competencia');

    const where = contaReceber.aggregate.mock.calls[0]?.[0].where;
    expect(where).toMatchObject({
      deletedAt: null,
      profissionalId: null,
      status: { notIn: ['CANCELADO', 'RENEGOCIADO'] },
      dataVencimento: { gte: new Date('2026-10-01T00:00:00.000Z') },
    });
  });

  it('calcular na base recebimento soma as baixas do período (inclusive as parciais)', async () => {
    const { service, contaReceber, contaReceberBaixa } = setup({
      receber: [],
      baixas: [0, 0, 0],
      pagar: 0,
    });

    await service.calcular('2026-10-01', '2026-10-31', 'recebimento');

    expect(contaReceber.aggregate).not.toHaveBeenCalled();
    expect(contaReceberBaixa.aggregate.mock.calls[0]?.[0].where).toMatchObject({
      deletedAt: null,
      dataRecebimento: { lte: new Date('2026-10-31T00:00:00.000Z') },
      contaReceber: { deletedAt: null, profissionalId: null },
    });
  });

  it('obter: 10 cards, com anterior e variação; sem fonte aparecem sem valor', async () => {
    // Mês atual e mês anterior, em paralelo e na ordem de chamada.
    const { service } = setup({
      receber: [9070, 7910, 13650, 7910],
      baixas: [9070, 13650],
      pagar: 100,
    });

    const r = await service.obter({ mes: '2026-10' });

    expect(r).toMatchObject({ mes: '2026-10', mesAnterior: '2026-09' });
    expect(r.indicadores).toHaveLength(10);
    expect(r.indicadores.find((i) => i.id === 'faturamento-total')).toMatchObject({
      secao: 'receitas',
      formato: 'moeda',
      valor: 9070,
    });
    for (const id of [
      'taxa-ocupacao',
      'vacancia',
      'permutas',
      'novos-clientes',
      'contratos-cancelados',
    ]) {
      expect(r.indicadores.find((i) => i.id === id)).toMatchObject({
        valor: null,
        anterior: null,
        variacao: null,
      });
    }
  });

  it('obter sem mês usa o mês atual', async () => {
    const { service } = setup({ receber: [], baixas: [], pagar: 0 });

    const r = await service.obter({});

    expect(r.mes).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('somarReceber (Painel "Hoje", #170)', () => {
  const d = (v: number) => new Prisma.Decimal(v);

  it('contratada é a soma dos títulos; recebido, as baixas; a receber, o saldo dos abertos', () => {
    const resumo = somarReceber([
      { valor: d(1000), status: 'PENDENTE', baixas: [] },
      { valor: d(500), status: 'RECEBIDO', baixas: [{ valorRecebido: d(500) }] },
      { valor: d(300), status: 'PARCIAL', baixas: [{ valorRecebido: d(100) }] },
    ]);

    expect(resumo).toEqual({ contratada: 1800, recebido: 600, aReceber: 1200 });
    expect(resumo.contratada).toBe(resumo.recebido + resumo.aReceber);
  });

  it('sem títulos: zero', () => {
    expect(somarReceber([])).toEqual({ contratada: 0, recebido: 0, aReceber: 0 });
  });
});
