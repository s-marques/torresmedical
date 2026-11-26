import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ConsultaRelatorio } from '../../../common/relatorios/relatorio.types';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import { RelatoriosFinanceiro } from './relatorios-financeiro';

const consulta = (
  periodo = { de: '2026-01-01', ate: '2026-01-10' },
  filtros: ConsultaRelatorio['filtros'] = {},
): ConsultaRelatorio => ({
  periodo,
  intervalo: { gte: new Date('2026-01-01T03:00:00Z'), lt: new Date('2026-01-11T03:00:00Z') },
  filtros,
});

const decimal = (n: number) => new Prisma.Decimal(n);
const dia = (valor: string) => new Date(`${valor}T00:00:00Z`);

function criar(tx: Record<string, unknown>, escopo: EscopoDadosService = escopoFalso()) {
  return new RelatoriosFinanceiro({ tx } as unknown as TransactionHost<PrismaAdapter>, escopo);
}

describe('RelatoriosFinanceiro', () => {
  it('registra os relatórios com dados, com a permissão da tela dona deles', () => {
    const { relatorios } = criar({});

    expect(relatorios.map((r) => [r.id, r.permissao])).toEqual([
      ['FIN-01', 'financeiro.contas-receber.ver'],
      ['FIN-06', 'financeiro.contas-receber.ver'],
      ['FIN-07', 'financeiro.contas-receber.ver'],
      ['FIN-10', 'financeiro.contas-receber.ver'],
      ['FIN-11', 'financeiro.contas-receber.ver'],
      ['FIN-12', 'financeiro.contas-pagar.ver'],
      ['FIN-13', 'financeiro.plano-contas.ver'],
      ['FIN-14', 'financeiro.plano-contas.ver'],
      ['FIN-17', 'financeiro.contas-pagar.ver'],
      ['FIN-19', 'financeiro.contas-pagar.ver'],
      ['FIN-20', 'financeiro.contas-receber.ver'],
      ['FIN-22', 'financeiro.indicadores.ver'],
      ['FIN-23', 'financeiro.indicadores.ver'],
      ['FIN-24', 'financeiro.plano-contas.ver'],
      ['FIN-25', 'financeiro.contas-pagar.ver'],
    ]);
  });

  it('perfil restrito a profissionais não vê nenhum relatório (403)', async () => {
    const restrito = escopoFalso(['p1']);
    const { relatorios } = criar({}, restrito);

    for (const relatorio of relatorios) {
      await expect(relatorio.buscar(consulta())).rejects.toMatchObject({ status: 403 });
      await expect(relatorio.contar(consulta())).rejects.toMatchObject({ status: 403 });
    }
  });

  it('FIN-12: a média é a dos 90 dias anteriores, proporcional aos dias do período', async () => {
    const groupBy = jest
      .fn()
      .mockResolvedValueOnce([
        { centroCustoId: 'c1', _sum: { valor: decimal(150) } },
        { centroCustoId: null, _sum: { valor: decimal(40) } },
      ])
      .mockResolvedValueOnce([{ centroCustoId: 'c1', _sum: { valor: decimal(900) } }]);
    const relatorios = criar({
      contaPagar: { groupBy },
      centroCusto: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', nome: 'Limpeza' }]) },
    });

    // 10 dias: média = 900 / 90 × 10 = 100.
    const linhas = await relatorios.linhasCentroCusto(consulta());

    expect(linhas).toEqual([
      { centroCusto: 'Limpeza', valor: 150, mediaPeriodo: 100, variacao: 50 },
      { centroCusto: 'Sem centro de custo', valor: 40, mediaPeriodo: 0, variacao: null },
    ]);
    // A janela anterior termina na véspera do período e começa 90 dias antes.
    const anterior = groupBy.mock.calls[1][0].where.dataVencimento;
    expect(anterior).toEqual({ gte: dia('2025-10-03'), lte: dia('2025-12-31') });
  });

  it('FIN-25: classifica em vencida, da semana e pendente a partir de hoje', async () => {
    const conta = (id: string, vencimento: string) => ({
      id,
      descricao: id,
      dataVencimento: dia(vencimento),
      valor: decimal(10),
      fornecedorId: null,
    });
    const relatorios = criar({
      contaPagar: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            conta('a', '2026-01-09'),
            conta('b', '2026-01-10'),
            conta('c', '2026-01-16'),
            conta('d', '2026-01-17'),
          ]),
      },
      fornecedor: { findMany: jest.fn().mockResolvedValue([]) },
    });

    const linhas = await relatorios.linhasPagarSemanal(
      consulta({ de: '2026-01-01', ate: '2026-02-01' }),
      '2026-01-10',
    );

    expect(linhas.map((l) => [l.descricao, l.situacao])).toEqual([
      ['a', 'Vencida'],
      ['b', 'Da semana'],
      ['c', 'Da semana'],
      ['d', 'Pendente'],
    ]);
  });

  it('FIN-25: o filtro "situacao" deixa só a situação escolhida', async () => {
    const relatorios = criar({
      contaPagar: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a',
            descricao: 'a',
            dataVencimento: dia('2026-01-09'),
            valor: decimal(1),
            fornecedorId: null,
          },
          {
            id: 'b',
            descricao: 'b',
            dataVencimento: dia('2026-01-12'),
            valor: decimal(2),
            fornecedorId: null,
          },
        ]),
      },
      fornecedor: { findMany: jest.fn().mockResolvedValue([]) },
    });

    const linhas = await relatorios.linhasPagarSemanal(
      consulta({ de: '2026-01-01', ate: '2026-02-01' }, { situacao: 'vencidas' }),
      '2026-01-10',
    );

    expect(linhas.map((l) => l.descricao)).toEqual(['a']);
  });

  it('FIN-23: o resultado é receitas menos despesas', async () => {
    const receitas = [
      { planoContaId: 'r1', _count: { _all: 2 }, _sum: { valor: decimal(1000) } },
      { planoContaId: null, _count: { _all: 1 }, _sum: { valor: decimal(500) } },
    ];
    const despesas = [{ planoContaId: 'd1', _count: { _all: 1 }, _sum: { valor: decimal(300) } }];
    const relatorios = criar({
      contaReceber: { groupBy: jest.fn().mockResolvedValue(receitas) },
      contaPagar: { groupBy: jest.fn().mockResolvedValue(despesas) },
      planoConta: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'r1', codigo: '4.01', nome: 'Consultas' },
          { id: 'd1', codigo: '3.01', nome: 'Aluguel' },
        ]),
      },
    });

    const linhas = await relatorios.linhasDre(consulta());

    expect(linhas.map((l) => [l.secao, l.conta, l.valor])).toEqual([
      ['Receitas', 'Sem conta contábil', 500],
      ['Receitas', 'Consultas', 1000],
      ['Despesas', 'Aluguel', 300],
      ['Resultado', 'Receitas menos despesas', 1200],
    ]);
  });
});
