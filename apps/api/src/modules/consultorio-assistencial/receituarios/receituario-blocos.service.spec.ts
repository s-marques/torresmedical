import type { TransactionHost } from '@nestjs-cls/transactional';
import {
  RECEITUARIO_BLOCO_EXPORT_COLUMNS,
  type CreateReceituarioBlocoInput,
  type ListReceituarioBlocosQuery,
} from '@torres/shared';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { naOrdem, paginarPorNome } from './ordenar-por-nome';
import {
  RECEITUARIO_BLOCO_EXPORT_DEFINITIONS,
  ReceituarioBlocosService,
} from './receituario-blocos.service';

const MEDICO = '1d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const OUTRO = '2d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const AGORA = new Date('2026-11-18T12:00:00.000Z');

function bloco(extra: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    tipo: 'AMARELA',
    numeroInicio: 1,
    numeroFim: 20,
    localizacao: null,
    profissionalId: MEDICO,
    dataRecebimento: new Date('2026-11-10T00:00:00.000Z'),
    usados: 5,
    status: 'ATIVO',
    createdAt: AGORA,
    updatedAt: AGORA,
    deletedAt: null,
    ...extra,
  };
}

function setup(escopo = escopoFalso()) {
  const tx = {
    receituarioBloco: {
      findMany: jest.fn().mockResolvedValue([bloco()]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(bloco({ ...data }))),
    },
  };
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'x.xlsx' }),
  };
  const profissionais = {
    detalhe: jest.fn().mockResolvedValue({ id: MEDICO, nome: 'Dr. Teste' }),
    nomesPorIds: jest.fn().mockResolvedValue(new Map([[MEDICO, 'Dr. Teste']])),
    idsPorBusca: jest.fn().mockResolvedValue([]),
  };
  const service = new ReceituarioBlocosService(
    { tx } as unknown as TransactionHost<PrismaAdapter>,
    exportService as unknown as ExportService,
    profissionais as unknown as ProfissionaisService,
    escopo,
  );
  return { service, tx, exportService, profissionais };
}

const INPUT: CreateReceituarioBlocoInput = {
  tipo: 'AMARELA',
  numeroInicio: 1,
  numeroFim: 20,
  localizacao: null,
  profissionalId: MEDICO,
  dataRecebimento: '2026-11-10',
};

const QUERY: ListReceituarioBlocosQuery = {
  page: 1,
  pageSize: 10,
  sort: { field: 'createdAt', direction: 'desc' },
};

describe('ReceituarioBlocosService', () => {
  describe('create', () => {
    it('grava o bloco com o nome do médico e a data de recebimento', async () => {
      const { service, tx } = setup();
      const criado = await service.create(INPUT);
      expect(tx.receituarioBloco.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tipo: 'AMARELA',
            numeroInicio: { lte: 20 },
            numeroFim: { gte: 1 },
          }),
        }),
      );
      expect(criado).toMatchObject({
        profissionalNome: 'Dr. Teste',
        dataRecebimento: '2026-11-10',
        total: 20,
      });
    });

    it('sem médico: grava sem nome', async () => {
      const { service, profissionais } = setup();
      const criado = await service.create({
        ...INPUT,
        profissionalId: null,
        dataRecebimento: null,
      });
      expect(profissionais.detalhe).not.toHaveBeenCalled();
      expect(criado).toMatchObject({ profissionalNome: null, dataRecebimento: null });
    });

    it('409 com faixa sobreposta', async () => {
      const { service, tx } = setup();
      tx.receituarioBloco.findFirst.mockResolvedValue({ id: 'outro' });
      await expect(service.create(INPUT)).rejects.toMatchObject({
        code: 'FAIXA_SOBREPOSTA',
        status: 409,
      });
      expect(tx.receituarioBloco.create).not.toHaveBeenCalled();
    });

    it('restrito: 403 sem médico ou com médico fora do escopo', async () => {
      const { service, tx } = setup(escopoFalso([MEDICO]));
      await expect(service.create({ ...INPUT, profissionalId: null })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(service.create({ ...INPUT, profissionalId: OUTRO })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(service.create(INPUT)).resolves.toBeDefined();
      expect(tx.receituarioBloco.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('list', () => {
    it('filtros, escopo e busca por localização, médico e número de folha', async () => {
      const { service, tx, profissionais } = setup(escopoFalso([MEDICO]));
      profissionais.idsPorBusca.mockResolvedValue([MEDICO]);
      const page = await service.list({ ...QUERY, tipo: 'AZUL', status: 'ATIVO', search: '15' });
      expect(page.data[0]).toMatchObject({ usados: 5, total: 20, profissionalNome: 'Dr. Teste' });
      const where = tx.receituarioBloco.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        tipo: 'AZUL',
        status: 'ATIVO',
        profissionalId: { in: [MEDICO] },
      });
      expect(where.OR).toEqual([
        { localizacao: { contains: '15', mode: 'insensitive' } },
        { profissionalId: { in: [MEDICO] } },
        { numeroInicio: { lte: 15 }, numeroFim: { gte: 15 } },
      ]);
    });

    it('ordena localização com vazios no fim e médico em memória', async () => {
      const porLocal = setup();
      await porLocal.service.list({ ...QUERY, sort: { field: 'localizacao', direction: 'asc' } });
      expect(porLocal.tx.receituarioBloco.findMany.mock.calls[0][0].orderBy[0]).toEqual({
        localizacao: { sort: 'asc', nulls: 'last' },
      });

      const porMedico = setup();
      porMedico.tx.receituarioBloco.findMany
        .mockResolvedValueOnce([
          { id: 'sem', profissionalId: null },
          { id: 'b1', profissionalId: MEDICO },
        ])
        .mockResolvedValueOnce([bloco({ id: 'sem', profissionalId: null }), bloco()]);
      const page = await porMedico.service.list({
        ...QUERY,
        sort: { field: 'medico', direction: 'desc' },
      });
      expect(page.data.map((b) => b.id)).toEqual(['b1', 'sem']);
    });
  });

  it('disponiveis: Ativos com médico; restrito, só os vinculados', async () => {
    const livre = setup();
    await livre.service.disponiveis();
    expect(livre.tx.receituarioBloco.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      status: 'ATIVO',
      profissionalId: { not: null },
    });
    const restrito = setup(escopoFalso([MEDICO]));
    await restrito.service.disponiveis();
    expect(restrito.tx.receituarioBloco.findMany.mock.calls[0][0].where.profissionalId).toEqual({
      in: [MEDICO],
    });
  });

  it('export com as colunas pedidas', async () => {
    const { service, exportService } = setup();
    await service.export({ ...QUERY, format: 'xlsx', columns: ['numeracao', 'usados'] });
    const args = exportService.export.mock.calls[0][0];
    expect(args.columns.map((c: { key: string }) => c.key)).toEqual(['numeracao', 'usados']);
    expect(RECEITUARIO_BLOCO_EXPORT_DEFINITIONS.map((c) => c.key)).toEqual([
      ...RECEITUARIO_BLOCO_EXPORT_COLUMNS,
    ]);
    const linha = args.rows[0];
    expect(RECEITUARIO_BLOCO_EXPORT_DEFINITIONS.map((c) => c.value(linha))).toEqual([
      'Amarela (A)',
      '000001 - 000020',
      '',
      'Dr. Teste',
      '5/20',
      'Ativo',
    ]);
  });
});

describe('paginarPorNome', () => {
  const nomes = new Map([
    ['p1', 'Álvaro'],
    ['p2', 'beatriz'],
  ]);
  const chaves = [
    { id: 'c', refId: null },
    { id: 'b', refId: 'p2' },
    { id: 'a', refId: 'p1' },
    { id: 'd', refId: 'excluido' },
  ];

  it('ordena por nome sem diferenciar acento e caixa, vazios sempre no fim', () => {
    const opcoes = { page: 1, pageSize: 10 };
    expect(paginarPorNome(chaves, nomes, { ...opcoes, direction: 'asc' }).ids).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(paginarPorNome(chaves, nomes, { ...opcoes, direction: 'desc' }).ids).toEqual([
      'b',
      'a',
      'c',
      'd',
    ]);
  });

  it('pagina e informa o total; naOrdem reordena e ignora ausentes', () => {
    expect(paginarPorNome(chaves, nomes, { page: 2, pageSize: 1, direction: 'asc' })).toEqual({
      ids: ['b'],
      total: 4,
    });
    expect(naOrdem(['x', 'b', 'a'], [{ id: 'a' }, { id: 'b' }])).toEqual([
      { id: 'b' },
      { id: 'a' },
    ]);
  });
});
