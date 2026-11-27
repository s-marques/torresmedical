import { escopoFalso } from '../../../../test/utils/escopo-falso';
import { Prisma } from '../../../generated/prisma/client';
import { InadimplenciaService } from './inadimplencia.service';

const HOJE = '2026-11-26';
const dec = (v: string) => new Prisma.Decimal(v);

let numero = 0;
function conta(vencimento: string, valor: string, extra: Record<string, unknown> = {}) {
  numero += 1;
  return {
    id: `conta-${numero}`,
    numero,
    descricao: `Título ${numero}`,
    valor: dec(valor),
    dataVencimento: new Date(`${vencimento}T00:00:00.000Z`),
    status: 'PENDENTE',
    paciente: null,
    profissionalSacado: null,
    profissionalSacadoId: null,
    contratoSala: null,
    contratoSalaId: null,
    baixas: [],
    _count: { cobrancas: 0 },
    ...extra,
  };
}

const profissional = (id: string, nome: string) => ({
  profissionalSacado: { id, nome },
  profissionalSacadoId: id,
});

function criar(contas: unknown[], escopo = escopoFalso()) {
  const tx = {
    contaReceber: { findMany: jest.fn().mockResolvedValue(contas) },
    cobrancaEnvio: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  return { service: new InadimplenciaService({ tx } as never, escopo), tx };
}

const CONTAS = () => {
  numero = 0;
  return [
    conta('2026-11-26', '300.00'), // a receber hoje
    conta('2026-11-25', '1000.00', {
      ...profissional('p1', 'Ana Fictícia'),
      contratoSala: { numero: 7 },
      contratoSalaId: 'ct-7',
      baixas: [{ valorRecebido: dec('400.00') }], // saldo 600
      status: 'PARCIAL',
    }),
    conta('2026-10-20', '200.00', {
      ...profissional('p1', 'Ana Fictícia'),
      contratoSalaId: 'ct-7',
    }),
    conta('2026-09-01', '150.50', {
      ...profissional('p2', 'Bruno Fictício'),
      contratoSalaId: 'ct-9',
    }),
    conta('2026-11-10', '80.00', { paciente: { nome: 'Paciente Fictício' } }),
  ];
};

describe('InadimplenciaService.painel', () => {
  it('soma o saldo em aberto: a receber hoje, vencidos e aging', async () => {
    const { service } = criar(CONTAS());
    const painel = await service.painel(HOJE);

    expect(painel.aReceberHoje).toEqual({ valor: '300.00', quantidade: 1 });
    // 600 (parcial) + 200 + 150,50 + 80 = 1030,50
    expect(painel.vencidos).toEqual({ valor: '1030.50', quantidade: 4 });
    const faixa = Object.fromEntries(painel.aging.map((a) => [a.faixa, a]));
    expect(faixa.ATE_30).toMatchObject({ valor: '680.00', quantidade: 2 }); // 600 (1 dia) + 80 (16 dias)
    expect(faixa.DE_31_A_60).toMatchObject({ valor: '200.00', quantidade: 1 }); // 37 dias
    expect(faixa.ACIMA_60).toMatchObject({ valor: '150.50', quantidade: 1 });
  });

  it('a soma das faixas fecha com o total vencido', async () => {
    const { service } = criar(CONTAS());
    const painel = await service.painel(HOJE);
    const soma = painel.aging.reduce((t, a) => t.add(a.valor), dec('0'));
    expect(soma.toFixed(2)).toBe(painel.vencidos.valor);
  });

  it('conta contratos e profissionais inadimplentes, do maior saldo para o menor', async () => {
    const { service } = criar(CONTAS());
    const painel = await service.painel(HOJE);
    expect(painel.contratosInadimplentes).toBe(2);
    expect(painel.profissionaisInadimplentes).toBe(2);
    expect(painel.porProfissional).toEqual([
      {
        profissionalId: 'p1',
        nome: 'Ana Fictícia',
        valor: '800.00',
        quantidade: 2,
        maiorAtrasoDias: 37,
      },
      {
        profissionalId: 'p2',
        nome: 'Bruno Fictício',
        valor: '150.50',
        quantidade: 1,
        maiorAtrasoDias: 86,
      },
    ]);
  });

  it('só considera títulos em aberto do Torres (a consulta exclui pagos, cancelados e receita de profissional)', async () => {
    const { service, tx } = criar([]);
    await service.painel(HOJE);
    expect(tx.contaReceber.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          profissionalId: null,
          status: { in: ['PENDENTE', 'PARCIAL'] },
          dataVencimento: { lte: new Date('2026-11-26T00:00:00.000Z') },
        },
      }),
    );
  });

  it('painel vazio zera tudo', async () => {
    const { service } = criar([]);
    const painel = await service.painel(HOJE);
    expect(painel.vencidos).toEqual({ valor: '0.00', quantidade: 0 });
    expect(painel.porProfissional).toEqual([]);
  });

  it('perfil restrito a profissionais recebe 403 (#153)', async () => {
    const { service } = criar([], escopoFalso(['p1']));
    await expect(service.painel(HOJE)).rejects.toMatchObject({ status: 403 });
  });
});

describe('InadimplenciaService.titulos', () => {
  const query = (extra = {}) => ({
    page: 1,
    pageSize: 10,
    search: undefined,
    sort: { field: 'vencimento' as const, direction: 'asc' as const },
    ...extra,
  });

  it('lista os mesmos títulos vencidos que o painel soma', async () => {
    const { service } = criar(CONTAS());
    const pagina = await service.titulos(query(), HOJE);
    expect(pagina.meta.total).toBe(4);
    expect(pagina.data.map((t) => t.saldo)).toEqual(['150.50', '200.00', '80.00', '600.00']);
    const soma = pagina.data.reduce((t, x) => t.add(x.saldo), dec('0'));
    expect(soma.toFixed(2)).toBe((await service.painel(HOJE)).vencidos.valor);
  });

  it('filtra por faixa e por profissional e ordena por saldo', async () => {
    const { service } = criar(CONTAS());
    const faixa = await service.titulos(query({ faixa: 'ACIMA_60' }), HOJE);
    expect(faixa.data.map((t) => t.sacadoNome)).toEqual(['Bruno Fictício']);

    const doProfissional = await service.titulos(
      query({ profissionalId: 'p1', sort: { field: 'saldo', direction: 'desc' } }),
      HOJE,
    );
    expect(doProfissional.data.map((t) => t.saldo)).toEqual(['600.00', '200.00']);
  });

  it('identifica o sacado (profissional ou paciente) e o atraso', async () => {
    const { service } = criar(CONTAS());
    const { data } = await service.titulos(
      query({ sort: { field: 'atraso', direction: 'desc' } }),
      HOJE,
    );
    expect(data[0]).toMatchObject({
      sacadoTipo: 'PROFISSIONAL',
      diasEmAtraso: 86,
      faixa: 'ACIMA_60',
    });
    expect(data.find((t) => t.sacadoTipo === 'PACIENTE')).toMatchObject({
      sacadoNome: 'Paciente Fictício',
    });
  });

  it('pagina', async () => {
    const { service } = criar(CONTAS());
    const pagina = await service.titulos(query({ pageSize: 3, page: 2 }), HOJE);
    expect(pagina.data).toHaveLength(1);
    expect(pagina.meta).toEqual({ page: 2, pageSize: 3, total: 4, totalPages: 2 });
  });
});
