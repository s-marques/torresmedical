import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  PEDIDO_COMPRA_ROTULO_STATUS,
  valorTotalPedidoCompra,
  type CreatePedidoCompraInput,
  type ExportPedidosCompraQuery,
  type ListPedidosCompraQuery,
  type PedidoCompra,
  type PedidoCompraExportColumn,
  type PedidoCompraStatus,
  type UpdatePedidoCompraInput,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { hojeNaClinica } from '../estoque/estoque-filtros';
import { FornecedoresService } from '../fornecedores/fornecedores.service';

const INCLUDE = {
  fornecedor: { select: { nome: true } },
  itens: {
    orderBy: { createdAt: 'asc' },
    include: { produto: { select: { nome: true } } },
  },
} as const satisfies Prisma.PedidoCompraInclude;

type PedidoComRelacoes = Prisma.PedidoCompraGetPayload<{ include: typeof INCLUDE }>;

const NAO_EXCLUIDOS = { deletedAt: null } as const;

const dia = (data: Date) => data.toISOString().slice(0, 10);

/** Colunas exportáveis, iguais às do grid. */
export const PEDIDO_COMPRA_EXPORT_DEFINITIONS: readonly ExportColumn<
  PedidoCompra,
  PedidoCompraExportColumn
>[] = [
  { key: 'numeroNf', header: 'NF', value: (p) => p.numeroNf ?? '' },
  { key: 'fornecedor', header: 'Fornecedor', value: (p) => p.fornecedorNome ?? '', width: 3 },
  { key: 'dataPedido', header: 'Data Pedido', type: 'date', value: (p) => p.dataPedido },
  { key: 'dataPrevisao', header: 'Previsao', type: 'date', value: (p) => p.dataPrevisao ?? '' },
  { key: 'valorTotal', header: 'Valor', type: 'currency', value: (p) => p.valorTotal },
  { key: 'qtdItens', header: 'Itens', type: 'number', value: (p) => p.qtdItens },
  { key: 'status', header: 'Status', value: (p) => PEDIDO_COMPRA_ROTULO_STATUS[p.status] },
];

export function toPedidoCompra(pedido: PedidoComRelacoes): PedidoCompra {
  return {
    id: pedido.id,
    fornecedorId: pedido.fornecedorId,
    fornecedorNome: pedido.fornecedor.nome,
    numeroNf: pedido.numeroNf,
    dataPedido: dia(pedido.dataPedido),
    dataPrevisao: pedido.dataPrevisao ? dia(pedido.dataPrevisao) : null,
    valorTotal: pedido.valorTotal.toString(),
    valorTotalInformado: pedido.valorTotalInformado,
    qtdItens: pedido.itens.length,
    status: pedido.status,
    observacoes: pedido.observacoes,
    itens: pedido.itens.map((item) => ({
      id: item.id,
      produtoId: item.produtoId,
      produtoNome: item.produto.nome,
      quantidade: item.quantidade.toString(),
      valorUnitario: item.valorUnitario.toString(),
      valorTotal: item.quantidade.mul(item.valorUnitario).toDecimalPlaces(2).toString(),
    })),
    createdAt: pedido.createdAt.toISOString(),
    updatedAt: pedido.updatedAt.toISOString(),
  };
}

/**
 * Pedidos em Trânsito (tela `/pedidos-compra`, título "Pedidos de Compra", issue #23). O pedido
 * nasce Em Transito; "Marcar como recebido" e "Cancelar" só mudam o status e não movimentam o
 * estoque (decisão do dev na issue #23). Só pedidos em trânsito podem ser alterados.
 */
@Injectable()
export class PedidosCompraService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly fornecedores: FornecedoresService,
  ) {}

  async list(query: ListPedidosCompraQuery): Promise<Page<PedidoCompra>> {
    const where = this.where(query);
    const orderBy = this.orderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.pedidoCompra.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.pedidoCompra.count({ where }),
    });
    return { ...page, data: page.data.map(toPedidoCompra) };
  }

  async findById(id: string): Promise<PedidoCompra> {
    return toPedidoCompra(await this.buscarAtivo(id));
  }

  async create(input: CreatePedidoCompraInput, agora = new Date()): Promise<PedidoCompra> {
    await this.validar(input);
    const pedido = await this.txHost.tx.pedidoCompra.create({
      data: {
        ...this.dados(input, agora),
        status: 'EM_TRANSITO',
        itens: { create: this.itens(input) },
      },
      include: INCLUDE,
    });
    return toPedidoCompra(pedido);
  }

  async update(
    id: string,
    input: UpdatePedidoCompraInput,
    agora = new Date(),
  ): Promise<PedidoCompra> {
    const atual = await this.buscarAtivo(id);
    this.exigirEmTransito(atual.status, 'editar');
    await this.validar(input);
    await this.txHost.tx.pedidoCompraItem.deleteMany({ where: { pedidoCompraId: id } });
    const pedido = await this.txHost.tx.pedidoCompra.update({
      where: { id },
      data: { ...this.dados(input, agora), itens: { create: this.itens(input) } },
      include: INCLUDE,
    });
    return toPedidoCompra(pedido);
  }

  /** "Marcar como recebido": só o status (não dá entrada no estoque). */
  receber(id: string): Promise<PedidoCompra> {
    return this.mudarStatus(id, 'RECEBIDO', 'marcar como recebido');
  }

  /** "Cancelar pedido". */
  cancelar(id: string): Promise<PedidoCompra> {
    return this.mudarStatus(id, 'CANCELADO', 'cancelar');
  }

  /** Exclusão lógica: histórico financeiro. */
  async remove(id: string): Promise<PedidoCompra> {
    await this.buscarAtivo(id);
    const pedido = await this.txHost.tx.pedidoCompra.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: INCLUDE,
    });
    return toPedidoCompra(pedido);
  }

  async export(query: ExportPedidosCompraQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.pedidoCompra.count({ where }));
    const rows = await this.txHost.tx.pedidoCompra.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      include: INCLUDE,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Pedidos de Compra',
      filename: 'pedidos-compra',
      columns: selectColumns(PEDIDO_COMPRA_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map(toPedidoCompra),
    });
  }

  private async mudarStatus(
    id: string,
    status: Exclude<PedidoCompraStatus, 'EM_TRANSITO'>,
    acao: string,
  ): Promise<PedidoCompra> {
    const atual = await this.buscarAtivo(id);
    this.exigirEmTransito(atual.status, acao);
    const pedido = await this.txHost.tx.pedidoCompra.update({
      where: { id },
      data: { status },
      include: INCLUDE,
    });
    return toPedidoCompra(pedido);
  }

  private exigirEmTransito(status: PedidoCompraStatus, acao: string): void {
    if (status !== 'EM_TRANSITO') {
      const rotulo = PEDIDO_COMPRA_ROTULO_STATUS[status].toLowerCase();
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        `Não é possível ${acao} um pedido ${rotulo}.`,
      );
    }
  }

  private async buscarAtivo(id: string): Promise<PedidoComRelacoes> {
    const pedido = await this.txHost.tx.pedidoCompra.findFirst({
      where: { id, ...NAO_EXCLUIDOS },
      include: INCLUDE,
    });
    if (!pedido) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Pedido de compra não encontrado', {
        status: 404,
      });
    }
    return pedido;
  }

  /** Fornecedor (service do módulo) e produtos precisam existir. */
  private async validar(input: CreatePedidoCompraInput): Promise<void> {
    await this.fornecedores.findById(input.fornecedorId);
    const produtoIds = [...new Set(input.itens.map((i) => i.produtoId))];
    if (produtoIds.length === 0) return;
    const encontrados = await this.txHost.tx.produto.count({
      where: { id: { in: produtoIds }, ...NAO_EXCLUIDOS },
    });
    if (encontrados !== produtoIds.length) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Produto não encontrado', { status: 404 });
    }
  }

  private dados(
    input: CreatePedidoCompraInput,
    agora: Date,
  ): Omit<Prisma.PedidoCompraUncheckedCreateInput, 'itens'> {
    return {
      fornecedorId: input.fornecedorId,
      numeroNf: input.numeroNf,
      dataPedido: new Date(input.dataPedido ?? hojeNaClinica(agora)),
      dataPrevisao: input.dataPrevisao ? new Date(input.dataPrevisao) : null,
      valorTotal: valorTotalPedidoCompra(input.itens, input.valorTotal),
      valorTotalInformado: input.valorTotal !== null,
      observacoes: input.observacoes,
    };
  }

  private itens(
    input: CreatePedidoCompraInput,
  ): Prisma.PedidoCompraItemUncheckedCreateWithoutPedidoCompraInput[] {
    return input.itens.map((i) => ({
      produtoId: i.produtoId,
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario,
    }));
  }

  private orderBy(
    sort: ListPedidosCompraQuery['sort'],
  ): Prisma.PedidoCompraOrderByWithRelationInput[] {
    const { field, direction } = sort;
    let principal: Prisma.PedidoCompraOrderByWithRelationInput;
    if (field === 'fornecedor') principal = { fornecedor: { nome: direction } };
    else if (field === 'qtdItens') principal = { itens: { _count: direction } };
    else if (field === 'numeroNf' || field === 'dataPrevisao')
      principal = { [field]: { sort: direction, nulls: 'last' } };
    else principal = { [field]: direction };
    return [principal, { createdAt: direction }, { id: direction }];
  }

  private where(
    query: Pick<ListPedidosCompraQuery, 'search' | 'status'>,
  ): Prisma.PedidoCompraWhereInput {
    return {
      ...NAO_EXCLUIDOS,
      status: query.status,
      ...(query.search && {
        OR: [
          { numeroNf: { contains: query.search, mode: 'insensitive' } },
          { fornecedor: { nome: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };
  }
}
