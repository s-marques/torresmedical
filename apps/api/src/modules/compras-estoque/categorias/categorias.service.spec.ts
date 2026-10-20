import type { TransactionHost } from '@nestjs-cls/transactional';
import type { CreateCategoriaInput } from '@torres/shared';
import { BusinessException } from '../../../common/errors/api.exception';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { CONSULTA_LOOKUP } from '../../../../test/utils/tx-host-falso';
import { CATEGORIA_EXPORT_DEFINITIONS, CategoriasService } from './categorias.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const CATEGORIA = {
  id: ID,
  nome: 'Estética',
  tipo: 'SERVICO',
  cor: '#6366f1',
  descricao: null,
  createdAt: new Date('2026-10-14T12:00:00.000Z'),
  updatedAt: new Date('2026-10-14T12:00:00.000Z'),
  deletedAt: null,
};

function setup() {
  const categoria = {
    findMany: jest.fn().mockResolvedValue([CATEGORIA]),
    findFirst: jest.fn().mockResolvedValue(CATEGORIA),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(CATEGORIA),
    update: jest.fn().mockResolvedValue(CATEGORIA),
  };
  const produto = { count: jest.fn().mockResolvedValue(0) };
  const txHost = { tx: { categoria, produto } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'categorias.xlsx' }),
  };
  const service = new CategoriasService(txHost, exportService as unknown as ExportService);
  return { service, categoria, produto, exportService };
}

describe('CategoriasService', () => {
  it('lookup: não excluídas (sem status), filtro por tipo, descrição com o tipo', async () => {
    const { service, categoria } = setup();

    const page = await service.lookup({ ...CONSULTA_LOOKUP, tipo: 'servico' });

    expect(categoria.count).toHaveBeenCalledWith({ where: { deletedAt: null, tipo: 'SERVICO' } });
    expect(page.data[0]).toEqual({ id: ID, label: 'Estética', descricao: 'Serviço' });
  });

  it('404 quando não existe', async () => {
    const { service, categoria } = setup();
    categoria.findFirst.mockResolvedValue(null);

    await expect(service.findById(ID)).rejects.toMatchObject({
      message: 'Categoria não encontrada',
    });
  });

  describe('list', () => {
    it('filtra excluídas, tipo e busca (nome e descrição); ordena e pagina', async () => {
      const { service, categoria } = setup();

      const page = await service.list({
        page: 2,
        pageSize: 5,
        sort: { field: 'tipo', direction: 'desc' },
        search: 'est',
        tipo: 'produto',
      });

      const where = {
        deletedAt: null,
        tipo: 'PRODUTO',
        OR: [
          { nome: { contains: 'est', mode: 'insensitive' } },
          { descricao: { contains: 'est', mode: 'insensitive' } },
        ],
      };
      expect(categoria.findMany).toHaveBeenCalledWith({
        where,
        orderBy: [{ tipo: 'desc' }, { id: 'desc' }],
        skip: 5,
        take: 5,
      });
      expect(categoria.count).toHaveBeenCalledWith({ where });
      expect(page.meta).toEqual({ page: 2, pageSize: 5, total: 1, totalPages: 1 });
    });
  });

  describe('create / update', () => {
    const INPUT: CreateCategoriaInput = {
      nome: 'Insumos',
      tipo: 'produto',
      cor: '#22c55e',
      descricao: null,
    };

    it('create grava tipo como enum do banco, sem checar nome repetido', async () => {
      const { service, categoria } = setup();

      await service.create(INPUT);

      expect(categoria.findFirst).not.toHaveBeenCalled();
      expect(categoria.create).toHaveBeenCalledWith({
        data: { nome: 'Insumos', tipo: 'PRODUTO', cor: '#22c55e', descricao: null },
      });
    });

    it('update altera a categoria existente', async () => {
      const { service, categoria } = setup();

      await service.update(ID, INPUT);

      expect(categoria.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { nome: 'Insumos', tipo: 'PRODUTO', cor: '#22c55e', descricao: null },
      });
    });

    it('update 404 quando não existe', async () => {
      const { service, categoria } = setup();
      categoria.findFirst.mockResolvedValue(null);

      await expect(service.update(ID, INPUT)).rejects.toMatchObject({
        message: 'Categoria não encontrada',
      });
      expect(categoria.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('exclusão lógica quando nenhum produto usa a categoria', async () => {
      const { service, categoria, produto } = setup();

      await service.remove(ID);

      expect(produto.count).toHaveBeenCalledWith({ where: { categoriaId: ID, deletedAt: null } });
      expect(categoria.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('409 CATEGORIA_EM_USO quando há produto ou serviço usando', async () => {
      const { service, categoria, produto } = setup();
      produto.count.mockResolvedValue(2);

      const erro: unknown = await service.remove(ID).catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(BusinessException);
      expect((erro as BusinessException).getStatus()).toBe(409);
      expect(erro).toMatchObject({ code: 'CATEGORIA_EM_USO' });
      expect(categoria.update).not.toHaveBeenCalled();
    });
  });

  describe('export', () => {
    it('usa os filtros da listagem e só as colunas pedidas', async () => {
      const { service, categoria, exportService } = setup();

      await service.export({
        format: 'xlsx',
        sort: { field: 'nome', direction: 'asc' },
        search: undefined,
        tipo: 'servico',
        columns: ['nome', 'tipo'],
      });

      expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
      expect(categoria.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, tipo: 'SERVICO' },
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      });
      expect(exportService.export).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Categorias',
          columns: CATEGORIA_EXPORT_DEFINITIONS.filter((c) => ['nome', 'tipo'].includes(c.key)),
        }),
      );
    });

    it('colunas do export: descrição vazia sai em branco', () => {
      const [nome, tipo, cor, descricao] = CATEGORIA_EXPORT_DEFINITIONS.map((c) =>
        c.value(CATEGORIA as never),
      );
      expect([nome, tipo, cor, descricao]).toEqual(['Estética', 'Serviço', '#6366f1', '']);
    });
  });
});
