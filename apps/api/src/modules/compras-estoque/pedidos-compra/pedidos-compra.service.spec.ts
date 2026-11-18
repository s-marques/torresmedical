import type { TransactionHost } from '@nestjs-cls/transactional';
import {
  PEDIDO_COMPRA_EXPORT_COLUMNS,
  type CreatePedidoCompraInput,
  type ListPedidosCompraQuery,
} from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { FornecedoresService } from '../fornecedores/fornecedores.service';
import { PEDIDO_COMPRA_EXPORT_DEFINITIONS, PedidosCompraService } from './pedidos-compra.service';

const FORNECEDOR = '2d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PRODUTO = '3d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
/** 17/11/2026, 23h00 em Brasília: em UTC já é 18/11, mas o pedido é do dia da clínica. */
const AGORA = new Date('2026-11-18T02:00:00.000Z');

function pedido(extra: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    fornecedorId: FORNECEDOR,
    numeroNf: '123',
    dataPedido: new Date('2026-11-18T00:00:00.000Z'),
    dataPrevisao: null,
    valorTotal: new Prisma.Decimal('20'),
    valorTotalInformado: false,
    status: 'EM_TRANSITO',
    observacoes: null,
    createdAt: AGORA,
    updatedAt: AGORA,
    deletedAt: null,
    fornecedor: { nome: 'Distribuidora Alfa' },
    itens: [
      {
        id: 'i1',
        produtoId: PRODUTO,
        quantidade: new Prisma.Decimal('2'),
        valorUnitario: new Prisma.Decimal('10'),
        produto: { nome: 'Luva' },
      },
    ],
    ...extra,
  };
}

function setup(atual = pedido()) {
  const tx = {
    pedidoCompra: {
      findMany: jest.fn().mockResolvedValue([atual]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(atual),
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve(pedido({ ...data, itens: atual.itens }))),
      update: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve(pedido({ ...data, itens: atual.itens }))),
    },
    pedidoCompraItem: { deleteMany: jest.fn() },
    produto: { count: jest.fn().mockResolvedValue(1) },
  };
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'pedidos-compra.xlsx' }),
  };
  const fornecedores = { findById: jest.fn().mockResolvedValue({ id: FORNECEDOR }) };
  const service = new PedidosCompraService(
    { tx } as unknown as TransactionHost<PrismaAdapter>,
    exportService as unknown as ExportService,
    fornecedores as unknown as FornecedoresService,
  );
  return { service, tx, exportService, fornecedores };
}

const INPUT: CreatePedidoCompraInput = {
  fornecedorId: FORNECEDOR,
  numeroNf: null,
  dataPedido: null,
  dataPrevisao: '2026-11-30',
  valorTotal: null,
  observacoes: null,
  itens: [{ produtoId: PRODUTO, quantidade: 2, valorUnitario: 10.5 }],
};

const QUERY: ListPedidosCompraQuery = {
  page: 1,
  pageSize: 10,
  sort: { field: 'dataPedido', direction: 'desc' },
  search: undefined,
  status: undefined,
};

describe('PedidosCompraService', () => {
  describe('create', () => {
    it('nasce Em Transito, com data de hoje na clínica e Valor Total "Auto" (soma dos itens)', async () => {
      const { service, tx, fornecedores } = setup();
      await service.create(INPUT, AGORA);
      expect(fornecedores.findById).toHaveBeenCalledWith(FORNECEDOR);
      const { data } = tx.pedidoCompra.create.mock.calls[0][0];
      expect(data).toMatchObject({
        status: 'EM_TRANSITO',
        dataPedido: new Date('2026-11-17'),
        dataPrevisao: new Date('2026-11-30'),
        valorTotal: 21,
        valorTotalInformado: false,
        itens: { create: [{ produtoId: PRODUTO, quantidade: 2, valorUnitario: 10.5 }] },
      });
    });

    it('Valor Total digitado prevalece; aceita pedido sem itens', async () => {
      const { service, tx } = setup();
      await service.create(
        { ...INPUT, dataPedido: '2026-11-10', valorTotal: 150, itens: [] },
        AGORA,
      );
      const { data } = tx.pedidoCompra.create.mock.calls[0][0];
      expect(data).toMatchObject({
        dataPedido: new Date('2026-11-10'),
        valorTotal: 150,
        valorTotalInformado: true,
        itens: { create: [] },
      });
      expect(tx.produto.count).not.toHaveBeenCalled();
    });

    it('404 se algum produto não existe', async () => {
      const { service, tx } = setup();
      tx.produto.count.mockResolvedValue(0);
      await expect(service.create(INPUT)).rejects.toMatchObject({ status: 404 });
      expect(tx.pedidoCompra.create).not.toHaveBeenCalled();
    });

    it('converte o pedido: decimais em texto, total da linha e quantidade de itens', async () => {
      const { service } = setup();
      const r = await service.create(INPUT, AGORA);
      expect(r).toMatchObject({
        fornecedorNome: 'Distribuidora Alfa',
        qtdItens: 1,
        itens: [{ produtoNome: 'Luva', quantidade: '2', valorUnitario: '10', valorTotal: '20' }],
      });
    });
  });

  describe('mudanças de status e edição', () => {
    it('receber e cancelar só mudam o status', async () => {
      const { service, tx } = setup();
      await service.receber('p1');
      expect(tx.pedidoCompra.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: { status: 'RECEBIDO' } }),
      );
      await service.cancelar('p1');
      expect(tx.pedidoCompra.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: { status: 'CANCELADO' } }),
      );
    });

    it.each([
      ['RECEBIDO', 'recebido'],
      ['CANCELADO', 'cancelado'],
    ])('422 ao alterar pedido %s', async (status, rotulo) => {
      const { service, tx } = setup(pedido({ status }));
      await expect(service.update('p1', INPUT)).rejects.toMatchObject({
        status: 422,
        message: `Não é possível editar um pedido ${rotulo}.`,
      });
      await expect(service.receber('p1')).rejects.toMatchObject({ status: 422 });
      await expect(service.cancelar('p1')).rejects.toMatchObject({ status: 422 });
      expect(tx.pedidoCompra.update).not.toHaveBeenCalled();
    });

    it('update troca os itens', async () => {
      const { service, tx } = setup();
      await service.update('p1', INPUT, AGORA);
      expect(tx.pedidoCompraItem.deleteMany).toHaveBeenCalledWith({
        where: { pedidoCompraId: 'p1' },
      });
      expect(tx.pedidoCompra.update.mock.calls[0][0].data.itens.create).toHaveLength(1);
    });

    it('404 para pedido inexistente ou excluído', async () => {
      const { service, tx } = setup();
      tx.pedidoCompra.findFirst.mockResolvedValue(null);
      await expect(service.findById('x')).rejects.toMatchObject({ status: 404 });
      await expect(service.remove('x')).rejects.toMatchObject({ status: 404 });
    });

    it('remove faz exclusão lógica em qualquer status', async () => {
      const { service, tx } = setup(pedido({ status: 'RECEBIDO' }));
      await service.remove('p1');
      expect(tx.pedidoCompra.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('list e export', () => {
    it('busca por NF ou fornecedor, filtra status e ignora excluídos', async () => {
      const { service, tx } = setup();
      await service.list({ ...QUERY, search: 'alfa', status: 'EM_TRANSITO' });
      expect(tx.pedidoCompra.findMany.mock.calls[0][0].where).toEqual({
        deletedAt: null,
        status: 'EM_TRANSITO',
        OR: [
          { numeroNf: { contains: 'alfa', mode: 'insensitive' } },
          { fornecedor: { nome: { contains: 'alfa', mode: 'insensitive' } } },
        ],
      });
    });

    it.each([
      ['fornecedor', { fornecedor: { nome: 'asc' } }],
      ['qtdItens', { itens: { _count: 'asc' } }],
      ['dataPrevisao', { dataPrevisao: { sort: 'asc', nulls: 'last' } }],
      ['valorTotal', { valorTotal: 'asc' }],
    ] as const)('ordena por %s', async (field, esperado) => {
      const { service, tx } = setup();
      await service.list({ ...QUERY, sort: { field, direction: 'asc' } });
      expect(tx.pedidoCompra.findMany.mock.calls[0][0].orderBy[0]).toEqual(esperado);
    });

    it('exporta com as colunas do grid', async () => {
      const { service, exportService } = setup();
      await service.export({
        ...QUERY,
        format: 'xlsx',
        columns: [...PEDIDO_COMPRA_EXPORT_COLUMNS],
      });
      expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
      const req = exportService.export.mock.calls[0][0];
      expect(req).toMatchObject({ title: 'Pedidos de Compra', filename: 'pedidos-compra' });
      const linha = req.rows[0];
      expect(PEDIDO_COMPRA_EXPORT_DEFINITIONS.map((c) => c.value(linha))).toEqual([
        '123',
        'Distribuidora Alfa',
        '2026-11-18',
        '',
        '20',
        1,
        'Em Transito',
      ]);
    });
  });
});
