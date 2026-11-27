import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  NEGOCIO_STATUS_ROTULO,
  type ExportNegociosQuery,
  type ListNegociosQuery,
  type Negocio,
  type NegocioExportColumn,
  type ResumoNegociosQuery,
  type ResumoQuadro,
} from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  INCLUDE,
  NAO_EXCLUIDOS,
  NegociosService,
  toNegocio,
  type NegocioCompleto,
} from './negocios.service';

type FiltroLista = Pick<ListNegociosQuery, 'search' | 'status' | 'pipelineId'>;
type Ordenacao = ListNegociosQuery['sort'];

/** Cliente e responsável são de outros módulos (sem FK): a ordenação é feita pelo nome resolvido. */
const ORDENA_POR_NOME = new Set<Ordenacao['field']>(['cliente', 'responsavel']);

export const NEGOCIO_EXPORT_DEFINITIONS: readonly ExportColumn<Negocio, NegocioExportColumn>[] = [
  { key: 'titulo', header: 'Título', value: (n) => n.titulo, width: 3 },
  { key: 'cliente', header: 'Cliente', value: (n) => n.contato, width: 3 },
  { key: 'estagio', header: 'Estágio', value: (n) => n.estagio, width: 2 },
  { key: 'valor', header: 'Valor (R$)', type: 'currency', value: (n) => n.valor },
  {
    key: 'previsaoFechamento',
    header: 'Previsão de fechamento',
    type: 'date',
    value: (n) => n.previsaoFechamento,
  },
  { key: 'status', header: 'Status', value: (n) => NEGOCIO_STATUS_ROTULO[n.status] },
  { key: 'origem', header: 'Origem', value: (n) => n.origem },
  { key: 'motivoPerda', header: 'Motivo da perda', value: (n) => n.motivoPerda, width: 2 },
  { key: 'responsavel', header: 'Responsável', value: (n) => n.responsavel, width: 2 },
];

function orderByDe(sort: Ordenacao): Prisma.NegocioOrderByWithRelationInput[] {
  const d = sort.direction;
  const ultimos = { sort: d, nulls: 'last' } as const;
  const campos: Partial<Record<Ordenacao['field'], Prisma.NegocioOrderByWithRelationInput>> = {
    titulo: { titulo: d },
    estagio: { estagio: { nome: d } },
    valor: { valor: ultimos },
    previsaoFechamento: { previsaoFechamento: ultimos },
    status: { status: d },
    origem: { origemCliente: { nome: d } },
    motivoPerda: { motivoPerda: { nome: d } },
  };
  return [campos[sort.field] ?? { createdAt: d }, { id: d }];
}

/** Texto vazio vai para o fim, em qualquer sentido. */
function compararNomes(a: string | null, b: string | null, direcao: 'asc' | 'desc'): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const ordem = a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
  return direcao === 'asc' ? ordem : -ordem;
}

/** Tela Negócios (`/negocios`): listagem paginada, resumo dos cartões e exportação. */
export type MarcoContagem = 'PRIMEIRO_CONTATO' | 'VISITA' | 'PROPOSTA' | 'CONTRATO' | 'SEM_MARCO';

export function somarPorMarco(
  marcoDoEstagio: ReadonlyMap<string, Exclude<MarcoContagem, 'SEM_MARCO'> | null>,
  grupos: ReadonlyArray<{ estagioId: string; quantidade: number }>,
): Record<MarcoContagem, number> {
  const total: Record<MarcoContagem, number> = {
    PRIMEIRO_CONTATO: 0,
    VISITA: 0,
    PROPOSTA: 0,
    CONTRATO: 0,
    SEM_MARCO: 0,
  };
  for (const { estagioId, quantidade } of grupos) {
    total[marcoDoEstagio.get(estagioId) ?? 'SEM_MARCO'] += quantidade;
  }
  return total;
}

@Injectable()
export class NegociosListaService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly negocios: NegociosService,
    private readonly exportService: ExportService,
  ) {}

  async list(query: ListNegociosQuery): Promise<Page<Negocio>> {
    const where = await this.where(query);
    if (ORDENA_POR_NOME.has(query.sort.field)) {
      const todos = await this.todosOrdenadosPorNome(where, query.sort);
      const inicio = (query.page - 1) * query.pageSize;
      return {
        data: todos.slice(inicio, inicio + query.pageSize),
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total: todos.length,
          totalPages: Math.ceil(todos.length / query.pageSize),
        },
      };
    }
    const orderBy = orderByDe(query.sort);
    const pagina = await paginate(query, {
      findMany: (p) => this.txHost.tx.negocio.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.negocio.count({ where }),
    });
    return { ...pagina, data: await this.paraDto(pagina.data) };
  }

  /** Cartões do cabeçalho: busca e pipeline valem, o chip de status não. */
  async resumo(query: ResumoNegociosQuery): Promise<ResumoQuadro> {
    const where = await this.where({ ...query, status: undefined });
    const grupos = await this.txHost.tx.negocio.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: { valor: true },
    });
    const deStatus = (status: 'ABERTO' | 'GANHO' | 'PERDIDO') => {
      const grupo = grupos.find((g) => g.status === status);
      return {
        quantidade: grupo?._count._all ?? 0,
        total: (grupo?._sum.valor ?? new Prisma.Decimal(0)).toFixed(2),
      };
    };
    return {
      abertos: deStatus('ABERTO'),
      ganhos: deStatus('GANHO'),
      perdidos: deStatus('PERDIDO'),
    };
  }

  /**
   * Negócios em aberto por marco do estágio (Painel "Hoje", #170). Estágio sem marco entra em
   * `SEM_MARCO`.
   */
  async contarAbertosPorMarco(): Promise<Record<MarcoContagem, number>> {
    const [estagios, grupos] = await Promise.all([
      this.txHost.tx.estagioPipeline.findMany({
        where: { deletedAt: null },
        select: { id: true, marco: true },
      }),
      this.txHost.tx.negocio.groupBy({
        by: ['estagioId'],
        where: { deletedAt: null, status: 'ABERTO' },
        _count: { _all: true },
      }),
    ]);
    return somarPorMarco(
      new Map(estagios.map((e) => [e.id, e.marco])),
      grupos.map((g) => ({ estagioId: g.estagioId, quantidade: g._count._all })),
    );
  }

  async export(query: ExportNegociosQuery): Promise<ExportFile> {
    const where = await this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.negocio.count({ where }));
    const rows = ORDENA_POR_NOME.has(query.sort.field)
      ? await this.todosOrdenadosPorNome(where, query.sort)
      : await this.paraDto(
          await this.txHost.tx.negocio.findMany({
            where,
            orderBy: orderByDe(query.sort),
            include: INCLUDE,
          }),
        );
    return this.exportService.export({
      format: query.format,
      title: 'Negócios',
      filename: 'negocios',
      columns: selectColumns(NEGOCIO_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  private async where(query: FiltroLista): Promise<Prisma.NegocioWhereInput> {
    return {
      ...NAO_EXCLUIDOS,
      ...(query.status ? { status: query.status } : {}),
      ...(query.pipelineId ? { pipelineId: query.pipelineId } : {}),
      ...(await this.negocios.whereBusca(query.search)),
    };
  }

  private async todosOrdenadosPorNome(
    where: Prisma.NegocioWhereInput,
    sort: Ordenacao,
  ): Promise<Negocio[]> {
    const campo = sort.field === 'cliente' ? 'contato' : 'responsavel';
    const dtos = await this.paraDto(
      await this.txHost.tx.negocio.findMany({
        where,
        orderBy: [{ titulo: 'asc' }, { id: 'asc' }],
        include: INCLUDE,
      }),
    );
    return dtos.sort((a, b) => compararNomes(a[campo], b[campo], sort.direction));
  }

  private async paraDto(linhas: readonly NegocioCompleto[]): Promise<Negocio[]> {
    const nomes = await this.negocios.nomes(linhas);
    const agora = new Date();
    return linhas.map((linha) => toNegocio(linha, nomes, agora));
  }
}
