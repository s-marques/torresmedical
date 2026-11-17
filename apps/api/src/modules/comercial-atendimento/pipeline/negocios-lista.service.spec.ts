import { Prisma } from '../../../generated/prisma/client';
import { NegociosListaService } from './negocios-lista.service';
import type { NegocioCompleto } from './negocios.service';

const PIPELINE = '00000000-0000-4000-8000-0000000000a1';

function linha(titulo: string, extra: Partial<NegocioCompleto> = {}): NegocioCompleto {
  return {
    id: `id-${titulo}`,
    pipelineId: PIPELINE,
    estagioId: '00000000-0000-4000-8000-0000000000b1',
    titulo,
    valor: null,
    contatoTipo: null,
    contatoId: null,
    responsavelId: null,
    previsaoFechamento: null,
    origemClienteId: null,
    status: 'ABERTO',
    motivoPerdaId: null,
    observacoes: null,
    fechadoEm: null,
    marcoPrimeiroContatoEm: null,
    marcoVisitaEm: null,
    marcoPropostaEm: null,
    marcoContratoEm: null,
    createdAt: new Date('2026-11-01T12:00:00Z'),
    updatedAt: new Date('2026-11-01T12:00:00Z'),
    deletedAt: null,
    estagio: { nome: 'Contato inicial' },
    origemCliente: null,
    motivoPerda: null,
    atividades: [],
    ...extra,
  } as NegocioCompleto;
}

function criar(linhas: NegocioCompleto[], nomesContato: Record<string, string> = {}) {
  const findMany = jest.fn(async () => linhas);
  const count = jest.fn(async () => linhas.length);
  const groupBy = jest.fn(async () => [
    { status: 'ABERTO', _count: { _all: 2 }, _sum: { valor: new Prisma.Decimal('150.5') } },
  ]);
  const negocios = {
    whereBusca: jest.fn(async (search?: string) =>
      search ? { titulo: { contains: search } } : {},
    ),
    nomes: jest.fn(async () => ({
      pacientes: new Map(Object.entries(nomesContato)),
      profissionais: new Map(),
      usuarios: new Map(),
    })),
  };
  const exportService = { ensureWithinLimit: jest.fn(), export: jest.fn(async (r) => r) };
  const service = new NegociosListaService(
    { tx: { negocio: { findMany, count, groupBy } } } as never,
    negocios as never,
    exportService as never,
  );
  return { service, findMany, count, groupBy, negocios, exportService };
}

const query = (extra: object = {}) =>
  ({ page: 1, pageSize: 10, sort: { field: 'titulo', direction: 'asc' }, ...extra }) as never;

describe('NegociosListaService', () => {
  it('list: filtra por pipeline, status e busca e ordena no banco, desempatando por id', async () => {
    const { service, findMany } = criar([linha('A')]);
    const pagina = await service.list(
      query({
        pipelineId: PIPELINE,
        status: 'GANHO',
        search: 'sala',
        sort: { field: 'estagio', direction: 'desc' },
      }),
    );
    expect(pagina.data.map((n) => n.titulo)).toEqual(['A']);
    expect(pagina.meta).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          status: 'GANHO',
          pipelineId: PIPELINE,
          titulo: { contains: 'sala' },
        },
        orderBy: [{ estagio: { nome: 'desc' } }, { id: 'desc' }],
        skip: 0,
        take: 10,
      }),
    );
  });

  it.each([
    ['valor', { valor: { sort: 'asc', nulls: 'last' } }],
    ['origem', { origemCliente: { nome: 'asc' } }],
    ['motivoPerda', { motivoPerda: { nome: 'asc' } }],
    ['status', { status: 'asc' }],
    ['previsaoFechamento', { previsaoFechamento: { sort: 'asc', nulls: 'last' } }],
  ])('list: ordenação por %s', async (campo, esperado) => {
    const { service, findMany } = criar([]);
    await service.list(query({ sort: { field: campo, direction: 'asc' } }));
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [esperado, { id: 'asc' }] }),
    );
  });

  it('list: ordena por cliente pelo nome resolvido, vazio no fim, e pagina em memória', async () => {
    const ana = '00000000-0000-4000-8000-0000000000e1';
    const bia = '00000000-0000-4000-8000-0000000000e2';
    const linhas = [
      linha('Sem cliente'),
      linha('Da Bia', { contatoTipo: 'PACIENTE', contatoId: bia }),
      linha('Da Ana', { contatoTipo: 'PACIENTE', contatoId: ana }),
    ];
    const { service } = criar(linhas, { [ana]: 'Ana', [bia]: 'Bia' });

    const asc = await service.list(query({ sort: { field: 'cliente', direction: 'asc' } }));
    expect(asc.data.map((n) => n.titulo)).toEqual(['Da Ana', 'Da Bia', 'Sem cliente']);

    const desc = await service.list(
      query({ pageSize: 2, page: 1, sort: { field: 'cliente', direction: 'desc' } }),
    );
    expect(desc.data.map((n) => n.titulo)).toEqual(['Da Bia', 'Da Ana']);
    expect(desc.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
  });

  it('resumo: soma por status e zera os que não existem; ignora o chip de status', async () => {
    const { service, groupBy } = criar([]);
    const resumo = await service.resumo({ pipelineId: PIPELINE } as never);
    expect(resumo).toEqual({
      abertos: { quantidade: 2, total: '150.50' },
      ganhos: { quantidade: 0, total: '0.00' },
      perdidos: { quantidade: 0, total: '0.00' },
    });
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, pipelineId: PIPELINE } }),
    );
  });

  it('export: respeita o limite e monta as colunas escolhidas', async () => {
    const { service, exportService } = criar([
      linha('A', { valor: new Prisma.Decimal('10'), status: 'GANHO' }),
    ]);
    const arquivo = (await service.export({
      format: 'xlsx',
      columns: ['titulo', 'status', 'valor'],
      sort: { field: 'titulo', direction: 'asc' },
    } as never)) as unknown as {
      filename: string;
      columns: { key: string; value: (n: never) => unknown }[];
      rows: { titulo: string }[];
    };
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    expect(arquivo.filename).toBe('negocios');
    expect(arquivo.columns.map((c) => c.key)).toEqual(['titulo', 'status', 'valor']);
    expect(arquivo.columns[1]?.value(arquivo.rows[0] as never)).toBe('Ganho');
  });

  it('export: ordenando por responsável carrega todos e ordena pelo nome', async () => {
    const { service, findMany } = criar([linha('A'), linha('B')]);
    await service.export({
      format: 'pdf',
      columns: ['titulo'],
      sort: { field: 'responsavel', direction: 'asc' },
    } as never);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ titulo: 'asc' }, { id: 'asc' }] }),
    );
  });
});
