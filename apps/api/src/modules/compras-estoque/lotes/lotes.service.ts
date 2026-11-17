import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  LOTE_DIAS_VENCENDO,
  ROTULO_LOTE_STATUS,
  somarDias,
  statusLote,
  type ExportLotesQuery,
  type ListLotesQuery,
  type Lote,
  type LoteExportColumn,
  type LoteInput,
  type ResumoLotes,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, searchWhere, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  dataDoBanco,
  filtroAbaixoMinimo,
  hojeNaClinica,
  PRODUTOS_ESTOQUE,
} from '../estoque/estoque-filtros';

const INCLUDE = {
  produto: { select: { nome: true, sku: true } },
} as const satisfies Prisma.LoteInclude;

type LoteComProduto = Prisma.LoteGetPayload<{ include: typeof INCLUDE }>;

/** Lote não excluído, de produto não excluído. */
const ATIVOS = {
  deletedAt: null,
  produto: { deletedAt: null },
} as const satisfies Prisma.LoteWhereInput;

/** Colunas do "Exportar", iguais às do grid. */
export const LOTE_EXPORT_DEFINITIONS: readonly ExportColumn<Lote, LoteExportColumn>[] = [
  { key: 'produto', header: 'Produto', value: (l) => l.produtoNome, width: 3 },
  { key: 'lote', header: 'Lote', value: (l) => l.numero, width: 2 },
  { key: 'quantidade', header: 'Quantidade', type: 'number', value: (l) => l.quantidade },
  {
    key: 'vencimento',
    header: 'Vencimento',
    type: 'date',
    value: (l) => dataDoBanco(l.dataVencimento),
  },
  { key: 'status', header: 'Status', value: (l) => ROTULO_LOTE_STATUS[l.status] },
];

/**
 * Tela Lotes / Validade (`/lotes`, issue #22): cadastro e consulta de lotes com validade. O lote
 * não movimenta `Produto.estoqueAtual` (decisão do dev na issue #22). Também alimenta os cards e
 * a aba Alertas da tela Estoque.
 */
@Injectable()
export class LotesService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {}

  // --- Leitura ---

  async list(query: ListLotesQuery, agora = new Date()): Promise<Page<Lote>> {
    const where = this.where(query);
    const orderBy = this.orderBy(query.sort);
    const hoje = hojeNaClinica(agora);
    const page = await paginate(query, {
      findMany: (p) => this.txHost.tx.lote.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.lote.count({ where }),
    });
    return { ...page, data: page.data.map((l) => toLote(l, hoje)) };
  }

  async export(query: ExportLotesQuery, agora = new Date()): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.lote.count({ where }));
    const hoje = hojeNaClinica(agora);
    const lotes = await this.txHost.tx.lote.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      include: INCLUDE,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Controle de Lotes',
      filename: 'lotes',
      columns: selectColumns(LOTE_EXPORT_DEFINITIONS, query.columns),
      rows: lotes.map((l) => toLote(l, hoje)),
    });
  }

  /** Cards do topo: Lotes Vencidos, Vencendo em 60 dias e Estoque Abaixo do Mínimo. */
  async resumo(agora = new Date()): Promise<ResumoLotes> {
    const [{ vencidos, vencendo }, abaixoMinimo] = await Promise.all([
      this.contarVencimentos(LOTE_DIAS_VENCENDO, agora),
      this.txHost.tx.produto.count({
        where: filtroAbaixoMinimo(this.txHost.tx.produto.fields.estoqueMinimo),
      }),
    ]);
    return { vencidos, vencendo, abaixoMinimo };
  }

  /**
   * Lotes vencidos (antes de hoje) e vencendo (de hoje até `dias` dias). Usado também pelos
   * cards "Vencendo 30d" e "Vencidos" da tela Estoque.
   */
  async contarVencimentos(
    dias: number,
    agora = new Date(),
  ): Promise<{ vencidos: number; vencendo: number }> {
    const hoje = hojeNaClinica(agora);
    const [vencidos, vencendo] = await Promise.all([
      this.txHost.tx.lote.count({
        where: { ...ATIVOS, dataVencimento: { lt: dataDoBanco(hoje) } },
      }),
      this.txHost.tx.lote.count({ where: this.whereVencendo(hoje, dias) }),
    ]);
    return { vencidos, vencendo };
  }

  /** Lotes que vencem de hoje até `dias` dias, do mais próximo ao mais distante (aba Alertas). */
  async vencendo(dias: number, agora = new Date()): Promise<Lote[]> {
    const hoje = hojeNaClinica(agora);
    const lotes = await this.txHost.tx.lote.findMany({
      where: this.whereVencendo(hoje, dias),
      orderBy: [{ dataVencimento: 'asc' }, { produto: { nome: 'asc' } }, { id: 'asc' }],
      include: INCLUDE,
    });
    return lotes.map((l) => toLote(l, hoje));
  }

  // --- Escrita ---

  /** "Novo Lote" → "Cadastrar". O produto precisa existir e ser um produto (não serviço). */
  async create(input: LoteInput, agora = new Date()): Promise<Lote> {
    const produto = await this.txHost.tx.produto.findFirst({
      where: { id: input.produtoId, ...PRODUTOS_ESTOQUE },
      select: { id: true },
    });
    if (!produto) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Produto não encontrado', {
        status: 404,
        details: [{ field: 'produtoId', message: 'Produto não encontrado' }],
      });
    }
    const lote = await this.txHost.tx.lote.create({
      data: {
        produtoId: input.produtoId,
        numero: input.numero,
        dataVencimento: dataDoBanco(input.dataVencimento),
        quantidade: input.quantidade,
      },
      include: INCLUDE,
    });
    return toLote(lote, hojeNaClinica(agora));
  }

  // --- Internos ---

  private whereVencendo(hoje: string, dias: number): Prisma.LoteWhereInput {
    return {
      ...ATIVOS,
      dataVencimento: { gte: dataDoBanco(hoje), lte: dataDoBanco(somarDias(hoje, dias)) },
    };
  }

  private where(
    query: Pick<ListLotesQuery, 'search' | 'produtoId' | 'comSaldo'>,
  ): Prisma.LoteWhereInput {
    const filtros: Prisma.LoteWhereInput[] = [ATIVOS];
    if (query.produtoId) filtros.push({ produtoId: query.produtoId });
    if (query.comSaldo) filtros.push({ quantidade: { gt: 0 } });
    const numero = searchWhere(query.search, ['numero']);
    const produto = searchWhere(query.search, ['nome', 'sku']);
    if (numero && produto) filtros.push({ OR: [...numero.OR, { produto }] });
    return { AND: filtros };
  }

  /**
   * O status é calculado pelo vencimento (Vencido < Vencendo < Válido), então ordenar por
   * status é ordenar pelo vencimento.
   */
  private orderBy(sort: ListLotesQuery['sort']): Prisma.LoteOrderByWithRelationInput[] {
    const { field, direction } = sort;
    const principal: Record<typeof field, Prisma.LoteOrderByWithRelationInput> = {
      produto: { produto: { nome: direction } },
      lote: { numero: direction },
      quantidade: { quantidade: direction },
      vencimento: { dataVencimento: direction },
      status: { dataVencimento: direction },
    };
    return [principal[field], { dataVencimento: 'asc' }, { numero: 'asc' }, { id: 'asc' }];
  }
}

function toLote(l: LoteComProduto, hoje: string): Lote {
  const dataVencimento = l.dataVencimento.toISOString().slice(0, 10);
  return {
    id: l.id,
    produtoId: l.produtoId,
    produtoNome: l.produto.nome,
    produtoSku: l.produto.sku,
    numero: l.numero,
    dataVencimento,
    quantidade: l.quantidade.toString(),
    status: statusLote(dataVencimento, hoje),
    createdAt: l.createdAt.toISOString(),
  };
}
