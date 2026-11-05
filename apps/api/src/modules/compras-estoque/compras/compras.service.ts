import { TransactionHost } from '@nestjs-cls/transactional';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
  COMPRA_ROTULO_STATUS,
  totalCompra,
  type Compra,
  type CompraExportColumn,
  type CompraItemInput,
  type CompraXmlPrevia,
  type CreateCompraInput,
  type ExportComprasQuery,
  type ListComprasQuery,
  type UpdateCompraInput,
} from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { PlanoContasService } from '../../financeiro/plano-contas/plano-contas.service';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { lerNfeXml } from './nfe-xml';

const INCLUDE = {
  fornecedor: { select: { nome: true } },
  itens: {
    orderBy: { createdAt: 'asc' },
    include: { produto: { select: { nome: true } } },
  },
} as const satisfies Prisma.CompraInclude;

type CompraComRelacoes = Prisma.CompraGetPayload<{ include: typeof INCLUDE }>;

const NAO_EXCLUIDAS = { deletedAt: null } as const;

const dia = (data: Date) => data.toISOString().slice(0, 10);

/** Colunas exportáveis, iguais às do grid. */
export const COMPRA_EXPORT_DEFINITIONS: readonly ExportColumn<Compra, CompraExportColumn>[] = [
  { key: 'id', header: '#', type: 'number', value: (c) => c.numero },
  { key: 'dataEntrada', header: 'Data', type: 'date', value: (c) => c.dataEntrada },
  { key: 'fornecedor', header: 'Fornecedor', value: (c) => c.fornecedorNome ?? '', width: 3 },
  { key: 'numeroNf', header: 'NF', value: (c) => c.numeroNf ?? '' },
  { key: 'valorTotal', header: 'Valor Total', type: 'currency', value: (c) => c.valorTotal },
  { key: 'status', header: 'Status', value: (c) => COMPRA_ROTULO_STATUS[c.status] },
];

/**
 * Entrada de Compras (tela `/compras`). Compra registrada nasce RECEBIDA e soma os itens no
 * estoque dos produtos que controlam estoque; cancelar, excluir ou editar desfaz e refaz a
 * entrada (decisão confirmada com o dev na issue #19).
 */
@Injectable()
export class ComprasService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly fornecedores: FornecedoresService,
    @Inject(forwardRef(() => PlanoContasService))
    private readonly planoContas: PlanoContasService,
  ) {}

  async list(query: ListComprasQuery): Promise<Page<Compra>> {
    const where = this.where(query);
    const orderBy = this.orderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) => this.txHost.tx.compra.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.compra.count({ where }),
    });
    const data = await Promise.all(page.data.map((c) => this.toCompra(c)));
    return { ...page, data };
  }

  async findById(id: string): Promise<Compra> {
    return this.toCompra(await this.buscarAtiva(id));
  }

  async create(input: CreateCompraInput): Promise<Compra> {
    await this.validar(input);
    const compra = await this.txHost.tx.compra.create({
      data: { ...this.dados(input), status: 'RECEBIDA', itens: { create: this.itens(input) } },
      include: INCLUDE,
    });
    await this.movimentarEstoque(compra.itens, 1);
    return this.toCompra(compra);
  }

  async update(id: string, input: UpdateCompraInput): Promise<Compra> {
    const atual = await this.buscarAtiva(id);
    if (atual.status === 'CANCELADA') {
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        'Não é possível editar uma compra cancelada.',
      );
    }
    await this.validar(input);
    if (atual.status === 'RECEBIDA') await this.movimentarEstoque(atual.itens, -1);
    await this.txHost.tx.compraItem.deleteMany({ where: { compraId: id } });
    const compra = await this.txHost.tx.compra.update({
      where: { id },
      data: { ...this.dados(input), itens: { create: this.itens(input) } },
      include: INCLUDE,
    });
    if (compra.status === 'RECEBIDA') await this.movimentarEstoque(compra.itens, 1);
    return this.toCompra(compra);
  }

  /** "Cancelar compra": status Cancelada e devolução da entrada no estoque. */
  async cancelar(id: string): Promise<Compra> {
    const atual = await this.buscarAtiva(id);
    if (atual.status === 'CANCELADA') {
      throw new BusinessException(ErrorCode.BUSINESS_RULE, 'Esta compra já está cancelada.');
    }
    if (atual.status === 'RECEBIDA') await this.movimentarEstoque(atual.itens, -1);
    const compra = await this.txHost.tx.compra.update({
      where: { id },
      data: { status: 'CANCELADA' },
      include: INCLUDE,
    });
    return this.toCompra(compra);
  }

  /** Exclusão lógica: histórico financeiro. Desfaz a entrada se a compra estava Recebida. */
  async remove(id: string): Promise<Compra> {
    const atual = await this.buscarAtiva(id);
    if (atual.status === 'RECEBIDA') await this.movimentarEstoque(atual.itens, -1);
    const compra = await this.txHost.tx.compra.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: INCLUDE,
    });
    return this.toCompra(compra);
  }

  /** Prévia da NF-e para o modal "Importar XML de NF-e". Nada é gravado. */
  async importarXml(xml: string): Promise<CompraXmlPrevia> {
    const nfe = lerNfeXml(xml);
    const fornecedor = nfe.fornecedorDocumento
      ? await this.txHost.tx.fornecedor.findFirst({
          where: { documento: nfe.fornecedorDocumento, ...NAO_EXCLUIDAS },
          select: { id: true },
        })
      : null;
    const itens = await Promise.all(
      nfe.itens.map(async (item) => {
        const codigos = [item.codigo, item.codigoBarras].filter((c): c is string => Boolean(c));
        const produto = codigos.length
          ? await this.txHost.tx.produto.findFirst({
              where: {
                ...NAO_EXCLUIDAS,
                OR: [{ sku: { in: codigos } }, { codigoBarras: { in: codigos } }],
              },
              select: { id: true },
            })
          : null;
        return {
          codigo: item.codigo,
          descricao: item.descricao,
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario,
          produtoId: produto?.id ?? null,
        };
      }),
    );
    return {
      numeroNf: nfe.numeroNf,
      serieNf: nfe.serieNf,
      dataEmissao: nfe.dataEmissao,
      fornecedorNome: nfe.fornecedorNome,
      fornecedorDocumento: nfe.fornecedorDocumento,
      fornecedorId: fornecedor?.id ?? null,
      frete: nfe.frete,
      desconto: nfe.desconto,
      itens,
    };
  }

  async export(query: ExportComprasQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.compra.count({ where }));
    const rows = await this.txHost.tx.compra.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      include: INCLUDE,
    });
    const data = await Promise.all(rows.map((c) => this.toCompra(c)));
    return this.exportService.export({
      format: query.format,
      title: 'Entrada de Compras',
      filename: 'compras',
      columns: selectColumns(COMPRA_EXPORT_DEFINITIONS, query.columns),
      rows: data,
    });
  }

  /** Soma (`sinal` 1) ou devolve (`sinal` -1) a quantidade no estoque dos produtos controlados. */
  private async movimentarEstoque(
    itens: readonly { produtoId: string; quantidade: Prisma.Decimal }[],
    sinal: 1 | -1,
  ): Promise<void> {
    for (const item of itens) {
      await this.txHost.tx.produto.updateMany({
        where: { id: item.produtoId, controlaEstoque: true },
        data: { estoqueAtual: { [sinal === 1 ? 'increment' : 'decrement']: item.quantidade } },
      });
    }
  }

  private async buscarAtiva(id: string): Promise<CompraComRelacoes> {
    const compra = await this.txHost.tx.compra.findFirst({
      where: { id, ...NAO_EXCLUIDAS },
      include: INCLUDE,
    });
    if (!compra) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Compra não encontrada', { status: 404 });
    }
    return compra;
  }

  /** Fornecedor, produtos e contas contábeis precisam existir (módulo dono ou mesmo módulo). */
  private async validar(input: CreateCompraInput): Promise<void> {
    await this.fornecedores.findById(input.fornecedorId);

    const produtoIds = [...new Set(input.itens.map((i) => i.produtoId))];
    const produtos = await this.txHost.tx.produto.findMany({
      where: { id: { in: produtoIds }, ...NAO_EXCLUIDAS },
      select: { id: true },
    });
    if (produtos.length !== produtoIds.length) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Produto não encontrado', { status: 404 });
    }

    const contaIds = new Set(input.itens.map((i) => i.planoContaId).filter(Boolean) as string[]);
    for (const contaId of contaIds) await this.planoContas.findById(contaId);
  }

  private async nomeConta(planoContaId: string | null): Promise<string | null> {
    if (!planoContaId) return null;
    try {
      return (await this.planoContas.findById(planoContaId)).nome;
    } catch {
      return null;
    }
  }

  private async toCompra(compra: CompraComRelacoes): Promise<Compra> {
    const itens = await Promise.all(
      compra.itens.map(async (item) => ({
        id: item.id,
        produtoId: item.produtoId,
        produtoNome: item.produto.nome,
        descricao: item.descricao,
        quantidade: item.quantidade.toString(),
        valorUnitario: item.valorUnitario.toString(),
        valorTotal: item.quantidade.mul(item.valorUnitario).toDecimalPlaces(2).toString(),
        planoContaId: item.planoContaId,
        planoContaNome: await this.nomeConta(item.planoContaId),
      })),
    );
    return {
      id: compra.id,
      numero: compra.numero,
      fornecedorId: compra.fornecedorId,
      fornecedorNome: compra.fornecedor.nome,
      numeroNf: compra.numeroNf,
      serieNf: compra.serieNf,
      dataEmissao: compra.dataEmissao ? dia(compra.dataEmissao) : null,
      dataEntrada: dia(compra.dataEntrada),
      frete: compra.frete.toString(),
      desconto: compra.desconto.toString(),
      valorTotal: compra.valorTotal.toString(),
      status: compra.status,
      observacoes: compra.observacoes,
      arquivoNfId: compra.arquivoNfId,
      itens,
      createdAt: compra.createdAt.toISOString(),
      updatedAt: compra.updatedAt.toISOString(),
    };
  }

  private dados(input: CreateCompraInput): Omit<Prisma.CompraUncheckedCreateInput, 'itens'> {
    return {
      fornecedorId: input.fornecedorId,
      numeroNf: input.numeroNf,
      serieNf: input.serieNf,
      dataEmissao: input.dataEmissao ? new Date(input.dataEmissao) : null,
      dataEntrada: new Date(input.dataEntrada),
      frete: input.frete,
      desconto: input.desconto,
      valorTotal: totalCompra(input.itens, input.frete, input.desconto),
      observacoes: input.observacoes,
      arquivoNfId: input.arquivoNfId,
    };
  }

  private itens(input: CreateCompraInput): Prisma.CompraItemUncheckedCreateWithoutCompraInput[] {
    return input.itens.map((i: CompraItemInput) => ({
      produtoId: i.produtoId,
      descricao: i.descricao,
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario,
      planoContaId: i.planoContaId,
    }));
  }

  private orderBy(sort: ListComprasQuery['sort']): Prisma.CompraOrderByWithRelationInput[] {
    const { field, direction } = sort;
    const principal: Prisma.CompraOrderByWithRelationInput =
      field === 'id'
        ? { numero: direction }
        : field === 'fornecedor'
          ? { fornecedor: { nome: direction } }
          : { [field]: direction };
    return [principal, { id: direction }];
  }

  private where(query: Pick<ListComprasQuery, 'search' | 'status'>): Prisma.CompraWhereInput {
    const numero = query.search && /^\d{1,9}$/.test(query.search) ? Number(query.search) : null;
    return {
      ...NAO_EXCLUIDAS,
      status: query.status,
      ...(query.search && {
        OR: [
          { numeroNf: { contains: query.search, mode: 'insensitive' } },
          { fornecedor: { nome: { contains: query.search, mode: 'insensitive' } } },
          ...(numero === null ? [] : [{ numero }]),
        ],
      }),
    };
  }
}
