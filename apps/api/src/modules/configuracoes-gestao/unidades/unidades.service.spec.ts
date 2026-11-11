import type { TransactionHost } from '@nestjs-cls/transactional';
import { BusinessException } from '../../../common/errors/api.exception';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { UNIDADE_EXPORT_DEFINITIONS, UnidadesService } from './unidades.service';

const EMPRESA_ID = '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';
const OUTRA_EMPRESA_ID = 'aaaaaaaa-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const UNIDADE = {
  id: ID,
  empresaId: EMPRESA_ID,
  nome: 'Matriz',
  endereco: null,
  cidade: null,
  uf: null,
  telefone: null,
  cnpj: null,
  cnes: null,
  ativo: true,
  createdAt: new Date('2026-10-14T12:00:00.000Z'),
  updatedAt: new Date('2026-10-14T12:00:00.000Z'),
  deletedAt: null,
};

function setup() {
  const unidade = {
    findMany: jest.fn().mockResolvedValue([UNIDADE]),
    findFirst: jest.fn().mockResolvedValue(UNIDADE),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(UNIDADE),
    update: jest.fn().mockResolvedValue(UNIDADE),
  };
  const empresa = { findFirst: jest.fn().mockResolvedValue({ id: EMPRESA_ID }) };
  const txHost = { tx: { unidade, empresa } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'unidades.xlsx' }),
  };
  const service = new UnidadesService(txHost, exportService as unknown as ExportService);
  return { service, unidade, empresa, exportService };
}

const SORT = { field: 'nome', direction: 'asc' } as const;

describe('UnidadesService', () => {
  describe('list', () => {
    it('filtra excluídas, status, empresa e busca; ordena e pagina', async () => {
      const { service, unidade } = setup();

      const page = await service.list(
        {
          page: 2,
          pageSize: 5,
          sort: { field: 'createdAt', direction: 'desc' },
          search: 'mat',
          status: 'inativo',
        },
        EMPRESA_ID,
      );

      const where = {
        deletedAt: null,
        empresaId: EMPRESA_ID,
        ativo: false,
        OR: [{ nome: { contains: 'mat', mode: 'insensitive' } }],
      };
      expect(unidade.findMany).toHaveBeenCalledWith({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 5,
        take: 5,
      });
      expect(unidade.count).toHaveBeenCalledWith({ where });
      expect(page.meta).toEqual({ page: 2, pageSize: 5, total: 1, totalPages: 1 });
    });

    it('sem status lista ativas e inativas', async () => {
      const { service, unidade } = setup();

      await service.list({ page: 1, pageSize: 10, sort: SORT, search: undefined }, EMPRESA_ID);

      expect(unidade.findMany.mock.calls[0][0].where).toEqual({
        deletedAt: null,
        empresaId: EMPRESA_ID,
        ativo: undefined,
      });
    });
  });

  describe('findByIdDaEmpresa', () => {
    it('404 para inexistente ou excluída', async () => {
      const { service, unidade } = setup();
      unidade.findFirst.mockResolvedValue(null);

      await expect(service.findByIdDaEmpresa(ID, EMPRESA_ID)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Unidade não encontrada',
      });
      expect(unidade.findFirst).toHaveBeenCalledWith({ where: { id: ID, deletedAt: null } });
    });

    it('404 quando a unidade é de outra empresa', async () => {
      const { service } = setup();

      await expect(service.findByIdDaEmpresa(ID, OUTRA_EMPRESA_ID)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Unidade não encontrada',
      });
    });
  });

  describe('create', () => {
    it('cria quando a empresa existe e o nome está livre', async () => {
      const { service, unidade } = setup();
      unidade.findFirst.mockResolvedValue(null);

      await service.create(
        {
          nome: 'Filial',
          endereco: null,
          cidade: null,
          uf: null,
          telefone: null,
          cnpj: null,
          cnes: null,
          ativo: true,
        },
        EMPRESA_ID,
      );

      expect(unidade.findFirst).toHaveBeenCalledWith({
        where: {
          empresaId: EMPRESA_ID,
          deletedAt: null,
          nome: { equals: 'Filial', mode: 'insensitive' },
          id: undefined,
        },
        select: { id: true },
      });
      expect(unidade.create).toHaveBeenCalledWith({
        data: {
          nome: 'Filial',
          endereco: null,
          cidade: null,
          uf: null,
          telefone: null,
          cnpj: null,
          cnes: null,
          ativo: true,
          empresaId: EMPRESA_ID,
        },
      });
    });

    it('422 EMPRESA_NAO_ENCONTRADA', async () => {
      const { service, empresa, unidade } = setup();
      empresa.findFirst.mockResolvedValue(null);

      const error = await service
        .create(
          {
            nome: 'X',
            endereco: null,
            cidade: null,
            uf: null,
            telefone: null,
            cnpj: null,
            cnes: null,
            ativo: true,
          },
          EMPRESA_ID,
        )
        .catch((e) => e);

      expect(error).toBeInstanceOf(BusinessException);
      expect(error).toMatchObject({ code: 'EMPRESA_NAO_ENCONTRADA' });
      expect(error.getStatus()).toBe(422);
      expect(unidade.create).not.toHaveBeenCalled();
    });

    it('409 UNIDADE_DUPLICADA com detail no nome', async () => {
      const { service, unidade } = setup();

      const error = await service
        .create(
          {
            nome: 'Matriz',
            endereco: null,
            cidade: null,
            uf: null,
            telefone: null,
            cnpj: null,
            cnes: null,
            ativo: true,
          },
          EMPRESA_ID,
        )
        .catch((e) => e);

      expect(error).toMatchObject({
        code: 'UNIDADE_DUPLICADA',
        details: [{ field: 'nome', message: 'Já existe uma unidade com este nome' }],
      });
      expect(error.getStatus()).toBe(409);
      expect(unidade.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('verifica nome duplicado ignorando a própria unidade', async () => {
      const { service, unidade } = setup();
      unidade.findFirst.mockResolvedValueOnce(UNIDADE).mockResolvedValueOnce(null);

      await service.update(ID, { nome: 'Novo' }, EMPRESA_ID);

      expect(unidade.findFirst.mock.calls[1][0].where).toMatchObject({
        id: { not: ID },
        empresaId: EMPRESA_ID,
      });
      expect(unidade.update).toHaveBeenCalledWith({ where: { id: ID }, data: { nome: 'Novo' } });
    });

    it('só ativo: não verifica nome', async () => {
      const { service, unidade } = setup();

      await service.update(ID, { ativo: false }, EMPRESA_ID);

      expect(unidade.findFirst).toHaveBeenCalledTimes(1);
    });

    it('404 ao tentar alterar unidade de outra empresa', async () => {
      const { service } = setup();

      await expect(service.update(ID, { ativo: false }, OUTRA_EMPRESA_ID)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  it('remove: exclusão lógica', async () => {
    const { service, unidade } = setup();

    await service.remove(ID, EMPRESA_ID);

    expect(unidade.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('export: confere o limite e usa os filtros, a ordenação e as colunas pedidas', async () => {
    const { service, unidade, exportService } = setup();
    unidade.count.mockResolvedValue(3);

    await service.export(
      {
        sort: SORT,
        search: undefined,
        status: 'ativo',
        format: 'pdf',
        columns: ['status', 'nome'],
      },
      EMPRESA_ID,
    );

    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(3);
    expect(unidade.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, empresaId: EMPRESA_ID, ativo: true },
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
    const request = exportService.export.mock.calls[0][0];
    expect(request).toMatchObject({
      format: 'pdf',
      title: 'Unidades',
      filename: 'unidades',
      rows: [UNIDADE],
    });
    expect(request.columns.map((c: { key: string }) => c.key)).toEqual(['status', 'nome']);
  });

  it('colunas de exportação formatam o status', () => {
    const status = UNIDADE_EXPORT_DEFINITIONS.find((c) => c.key === 'status');
    expect(status?.value(UNIDADE)).toBe('Ativo');
    expect(status?.value({ ...UNIDADE, ativo: false })).toBe('Inativo');
  });
});

describe('UnidadesService (lookup)', () => {
  it('só ativas e não excluídas, com filtro por empresa e busca', async () => {
    const { service, unidade } = setup();

    const page = await service.lookup({
      page: 1,
      pageSize: 10,
      sort: { field: 'nome', direction: 'asc' },
      search: 'mat',
      empresaId: EMPRESA_ID,
    });

    expect(unidade.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        ativo: true,
        empresaId: EMPRESA_ID,
        OR: [{ nome: { contains: 'mat', mode: 'insensitive' } }],
      },
    });
    expect(page.data).toEqual([{ id: ID, label: 'Matriz', descricao: null }]);
  });

  it('findLookupById devolve o item', async () => {
    const { service } = setup();

    await expect(service.findLookupById(ID)).resolves.toEqual({
      id: ID,
      label: 'Matriz',
      descricao: null,
    });
  });
});
