import type { TransactionHost } from '@nestjs-cls/transactional';
import type { CreateProdutoInput } from '@torres/shared';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { CONSULTA_LOOKUP } from '../../../../test/utils/tx-host-falso';
import { codigoDoProduto, PRODUTO_EXPORT_DEFINITIONS, ProdutosService } from './produtos.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const CATEGORIA_ID = '1c0d2e8f-2b3c-4d4e-9fa0-1b2c3d4e5f60';
const PRODUTO = {
  id: ID,
  nome: 'Soro fisiológico',
  tipo: 'PRODUTO',
  sku: '7890000000001',
  codigoBarras: null,
  precoVenda: '10',
  precoCusto: '6',
  estoqueAtual: '4',
  ativo: true,
};

const ENTRADA: CreateProdutoInput = {
  nome: 'Soro',
  tipo: 'uso-consumo',
  categoriaId: null,
  unidadeMedidaId: null,
  marca: null,
  codigoBarras: null,
  sku: null,
  precoCusto: null,
  precoVenda: 10,
  estoqueMinimo: 0,
  controlaEstoque: true,
  ncm: null,
  descricao: null,
};

function setup() {
  const produto = {
    findMany: jest.fn().mockResolvedValue([PRODUTO]),
    findFirst: jest.fn().mockResolvedValue(PRODUTO),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(PRODUTO),
    update: jest.fn().mockResolvedValue(PRODUTO),
  };
  const categoria = { count: jest.fn().mockResolvedValue(1) };
  const unidadeMedida = { count: jest.fn().mockResolvedValue(1) };
  const txHost = {
    tx: { produto, categoria, unidadeMedida },
  } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'produtos-servicos.xlsx' }),
  };
  const service = new ProdutosService(txHost, exportService as unknown as ExportService);
  return { service, produto, categoria, unidadeMedida, exportService };
}

describe('ProdutosService', () => {
  describe('lookup', () => {
    it('ativos, tipo produto agrupa os três tipos físicos, busca por nome, SKU e código de barras', async () => {
      const { service, produto } = setup();

      const page = await service.lookup({ ...CONSULTA_LOOKUP, search: '789', tipo: 'produto' });

      expect(produto.count.mock.calls[0][0].where).toEqual({
        deletedAt: null,
        ativo: true,
        tipo: { in: ['PRODUTO', 'REVENDA', 'USO_CONSUMO'] },
        OR: [
          { nome: { contains: '789', mode: 'insensitive' } },
          { sku: { contains: '789', mode: 'insensitive' } },
          { codigoBarras: { contains: '789', mode: 'insensitive' } },
        ],
      });
      expect(page.data[0]).toEqual({
        id: ID,
        label: 'Soro fisiológico',
        descricao: 'Produto · 7890000000001',
      });
    });

    it('serviço, e sem tipo não filtra', async () => {
      const { service, produto } = setup();
      produto.findMany.mockResolvedValue([{ ...PRODUTO, tipo: 'SERVICO', sku: null }]);

      const servicos = await service.lookup({ ...CONSULTA_LOOKUP, tipo: 'servico' });
      await service.lookup(CONSULTA_LOOKUP);

      expect(produto.count.mock.calls[0][0].where.tipo).toBe('SERVICO');
      expect(produto.count.mock.calls[1][0].where.tipo).toBeUndefined();
      expect(servicos.data[0]?.descricao).toBe('Serviço');
    });
  });

  describe('list', () => {
    it('exclui removidos, filtra por grupo e busca; ordena "codigo" pelo SKU e pagina', async () => {
      const { service, produto } = setup();

      const page = await service.list({
        page: 2,
        pageSize: 5,
        sort: { field: 'codigo', direction: 'desc' },
        search: 'soro',
        tipo: 'servico',
      });

      expect(produto.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          tipo: 'SERVICO',
          OR: [
            { nome: { contains: 'soro', mode: 'insensitive' } },
            { sku: { contains: 'soro', mode: 'insensitive' } },
            { codigoBarras: { contains: 'soro', mode: 'insensitive' } },
          ],
        },
        orderBy: [{ sku: 'desc' }, { id: 'desc' }],
        skip: 5,
        take: 5,
      });
      expect(page.meta).toEqual({ page: 2, pageSize: 5, total: 1, totalPages: 1 });
    });
  });

  describe('create e update', () => {
    it('create converte o tipo para o enum do banco', async () => {
      const { service, produto } = setup();

      await service.create(ENTRADA);

      expect(produto.create).toHaveBeenCalledWith({
        data: { ...ENTRADA, tipo: 'USO_CONSUMO' },
      });
    });

    it('400 quando a categoria ou a unidade não existem, sem gravar', async () => {
      const { service, produto, categoria, unidadeMedida } = setup();
      categoria.count.mockResolvedValue(0);

      await expect(service.create({ ...ENTRADA, categoriaId: CATEGORIA_ID })).rejects.toMatchObject(
        {
          message: 'Categoria não encontrada.',
        },
      );

      categoria.count.mockResolvedValue(1);
      unidadeMedida.count.mockResolvedValue(0);
      await expect(
        service.update(ID, { ...ENTRADA, unidadeMedidaId: CATEGORIA_ID }),
      ).rejects.toMatchObject({ message: 'Unidade de medida não encontrada.' });
      expect(produto.create).not.toHaveBeenCalled();
      expect(produto.update).not.toHaveBeenCalled();
    });

    it('update: 404 quando o produto não existe', async () => {
      const { service, produto } = setup();
      produto.findFirst.mockResolvedValue(null);

      await expect(service.update(ID, ENTRADA)).rejects.toMatchObject({
        message: 'Produto não encontrado',
      });
      expect(produto.update).not.toHaveBeenCalled();
    });
  });

  it('remove: exclusão lógica', async () => {
    const { service, produto } = setup();

    await service.remove(ID);

    expect(produto.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('export: respeita o limite, usa os filtros e as colunas pedidas', async () => {
    const { service, produto, exportService } = setup();

    await service.export({
      format: 'xlsx',
      sort: { field: 'nome', direction: 'asc' },
      search: undefined,
      tipo: 'produto',
      columns: ['nome', 'codigo'],
    });

    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    expect(produto.findMany.mock.calls[0][0].where.tipo).toEqual({
      in: ['PRODUTO', 'REVENDA', 'USO_CONSUMO'],
    });
    expect(
      exportService.export.mock.calls[0][0].columns.map((c: { key: string }) => c.key),
    ).toEqual(['nome', 'codigo']);
  });

  it('código do grid: SKU, senão código de barras, senão vazio', () => {
    expect(codigoDoProduto({ sku: 'A1', codigoBarras: '789' })).toBe('A1');
    expect(codigoDoProduto({ sku: null, codigoBarras: '789' })).toBe('789');
    expect(codigoDoProduto({ sku: null, codigoBarras: null })).toBe('');
    const status = PRODUTO_EXPORT_DEFINITIONS.find((c) => c.key === 'ativo');
    expect(status?.value({ ...PRODUTO, ativo: false } as never)).toBe('Inativo');
  });

  it('vendaveis: só ativos não excluídos, com busca, categoria e preço numérico', async () => {
    const { service, produto } = setup();
    produto.findMany.mockResolvedValue([
      { ...PRODUTO, precoVenda: { toNumber: () => 10.5 }, categoria: { nome: 'Infusão' } },
      { ...PRODUTO, id: CATEGORIA_ID, precoVenda: { toNumber: () => 0 }, categoria: null },
    ]);

    const page = await service.vendaveis({ page: 1, pageSize: 20, search: '789' });

    expect(page.data).toEqual([
      { id: ID, nome: 'Soro fisiológico', categoria: 'Infusão', precoVenda: 10.5 },
      { id: CATEGORIA_ID, nome: 'Soro fisiológico', categoria: null, precoVenda: 0 },
    ]);
    expect(produto.count.mock.calls[0][0].where).toMatchObject({
      deletedAt: null,
      ativo: true,
      OR: expect.any(Array),
    });
    expect(produto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ nome: 'asc' }, { id: 'asc' }], skip: 0, take: 20 }),
    );
  });

  it('404 quando não existe', async () => {
    const { service, produto } = setup();
    produto.findFirst.mockResolvedValue(null);

    await expect(service.findById(ID)).rejects.toMatchObject({
      message: 'Produto não encontrado',
    });
  });
});
