import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  calcularTotaisVenda,
  listProtocolosQuerySchema,
  VENDA_ROTULO_STATUS,
  type CatalogoVendaItem,
  type CatalogoVendaQuery,
  type CriarVendaInput,
  type ExportVendasQuery,
  type ListVendasQuery,
  type Venda,
  type VendaExportColumn,
  type VendaOrigem,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ProdutosService } from '../../compras-estoque/produtos/produtos.service';
import { FormasPagamentoService } from '../../financeiro/formas-pagamento/formas-pagamento.service';
import { ProtocolosService } from '../../gestao-profissionais/protocolos/protocolos.service';
import { PacientesService } from '../pacientes/pacientes.service';

const INCLUDE = {
  paciente: { select: { nome: true } },
  formaPagamento: { select: { nome: true } },
  itens: { orderBy: { posicao: 'asc' } },
} satisfies Prisma.VendaInclude;
type VendaCompleta = Prisma.VendaGetPayload<{ include: typeof INCLUDE }>;

const NAO_EXCLUIDAS = { deletedAt: null } as const;

const ORIGEM_PARA_BANCO = {
  produto: 'PRODUTO',
  protocolo: 'PROTOCOLO',
} as const satisfies Record<VendaOrigem, string>;

const ORIGEM_DO_BANCO = { PRODUTO: 'produto', PROTOCOLO: 'protocolo' } as const;

const STATUS_FILTRO = {
  'orcamento-aprovado': 'ORCAMENTO_APROVADO',
  finalizada: 'FINALIZADA',
  cancelada: 'CANCELADA',
} as const;

export function toVenda(v: VendaCompleta): Venda {
  return {
    id: v.id,
    numero: v.numero,
    data: v.createdAt.toISOString(),
    pacienteId: v.pacienteId,
    cliente: v.paciente?.nome ?? null,
    formaPagamentoId: v.formaPagamentoId,
    formaPagamento: v.formaPagamento?.nome ?? null,
    parcelas: v.parcelas,
    desconto: v.desconto.toString(),
    subtotal: v.subtotal.toString(),
    total: v.total.toString(),
    status: v.status,
    itens: v.itens.map((i) => ({
      id: i.id,
      origem: ORIGEM_DO_BANCO[i.origem],
      origemId: i.origemId,
      descricao: i.descricao,
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario.toString(),
      total: i.total.toString(),
    })),
  };
}

/** Colunas exportáveis, iguais às do grid. */
export const VENDA_EXPORT_DEFINITIONS: readonly ExportColumn<Venda, VendaExportColumn>[] = [
  { key: 'id', header: '#', type: 'number', value: (v) => v.numero },
  { key: 'data', header: 'Data', type: 'datetime', value: (v) => v.data },
  { key: 'cliente', header: 'Cliente', value: (v) => v.cliente ?? '-', width: 3 },
  { key: 'pagamento', header: 'Pagamento', value: (v) => v.formaPagamento ?? '-' },
  { key: 'total', header: 'Total', type: 'currency', value: (v) => v.total },
  { key: 'status', header: 'Status', value: (v) => VENDA_ROTULO_STATUS[v.status] },
];

/** Aba "Vendas (PDV)" da tela Vendas/PDV: listagem, exportação e Nova Venda. */
@Injectable()
export class VendasService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly pacientes: PacientesService,
    private readonly formasPagamento: FormasPagamentoService,
    private readonly produtos: ProdutosService,
    private readonly protocolos: ProtocolosService,
  ) {}

  async list(query: ListVendasQuery): Promise<Page<Venda>> {
    const where = this.where(query);
    const orderBy = this.orderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) => this.txHost.tx.venda.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.venda.count({ where }),
    });
    return { ...page, data: page.data.map(toVenda) };
  }

  /** Finalizar Venda: grava como Finalizada. Os totais são sempre recalculados aqui. */
  async create(input: CriarVendaInput): Promise<Venda> {
    if (input.pacienteId) await this.pacientes.findLookupById(input.pacienteId);
    if (input.formaPagamentoId) await this.formasPagamento.findLookupById(input.formaPagamentoId);
    for (const item of input.itens) await this.garantirOrigem(item.origem, item.origemId);

    const totais = calcularTotaisVenda(input.itens, input.desconto);
    const criada = await this.txHost.tx.venda.create({
      data: {
        pacienteId: input.pacienteId,
        formaPagamentoId: input.formaPagamentoId,
        parcelas: input.parcelas,
        desconto: totais.desconto,
        subtotal: totais.subtotal,
        total: totais.total,
        status: 'FINALIZADA',
        itens: {
          create: input.itens.map((item, posicao) => ({
            origem: ORIGEM_PARA_BANCO[item.origem],
            origemId: item.origemId,
            descricao: item.descricao,
            quantidade: item.quantidade,
            valorUnitario: item.valorUnitario,
            total: totais.totaisItens[posicao] ?? 0,
            posicao,
          })),
        },
      },
      include: INCLUDE,
    });
    return toVenda(criada);
  }

  async export(query: ExportVendasQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.venda.count({ where }));
    const rows = await this.txHost.tx.venda.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      include: INCLUDE,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Vendas (PDV)',
      filename: 'vendas-pdv',
      columns: selectColumns(VENDA_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map(toVenda),
    });
  }

  /** Busca do PDV: produtos/serviços (campo de busca) ou protocolos (botão Protocolo). */
  async catalogo(query: CatalogoVendaQuery): Promise<Page<CatalogoVendaItem>> {
    const { page, pageSize, search } = query;
    if (query.tipo === 'produto') {
      const r = await this.produtos.vendaveis({ page, pageSize, search });
      return {
        ...r,
        data: r.data.map((p) => ({
          id: p.id,
          nome: p.nome,
          detalhe: p.categoria,
          valor: p.precoVenda,
        })),
      };
    }
    const r = await this.protocolos.list(
      listProtocolosQuerySchema.parse({ page, pageSize, search }),
    );
    return {
      ...r,
      data: r.data.map((p) => ({
        id: p.id,
        nome: p.nome,
        detalhe: p.profissionalNome ?? p.categoria,
        valor: p.valorTotal,
      })),
    };
  }

  /** O cadastro de origem precisa existir (404 se não). */
  private async garantirOrigem(origem: VendaOrigem, id: string): Promise<void> {
    if (origem === 'produto') await this.produtos.findById(id);
    else await this.protocolos.findById(id);
  }

  private where(query: Pick<ListVendasQuery, 'search' | 'status'>): Prisma.VendaWhereInput {
    return {
      ...NAO_EXCLUIDAS,
      status: query.status && STATUS_FILTRO[query.status],
      ...(query.search && {
        paciente: { nome: { contains: query.search, mode: 'insensitive' } },
      }),
    };
  }

  private orderBy(sort: ListVendasQuery['sort']): Prisma.VendaOrderByWithRelationInput[] {
    const { field, direction } = sort;
    const principal: Prisma.VendaOrderByWithRelationInput = {
      id: { numero: direction },
      data: { createdAt: direction },
      cliente: { paciente: { nome: direction } },
      pagamento: { formaPagamento: { nome: direction } },
      total: { total: direction },
      status: { status: direction },
    }[field];
    return [principal, { id: direction }];
  }
}
