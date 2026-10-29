import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  CAIXA_ROTULO_STATUS,
  type AbrirCaixaInput,
  type Caixa,
  type CaixaExportColumn,
  type ExportCaixasQuery,
  type ListCaixasQuery,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const INCLUDE = { operador: { select: { nome: true } } } as const;
type CaixaComOperador = Prisma.CaixaGetPayload<{ include: typeof INCLUDE }>;

const NAO_EXCLUIDOS = { deletedAt: null } as const;

export function toCaixa(caixa: CaixaComOperador): Caixa {
  return {
    id: caixa.id,
    numero: caixa.numero,
    nome: caixa.nome,
    operadorId: caixa.operadorId,
    operador: caixa.operador.nome,
    dataAbertura: caixa.dataAbertura.toISOString(),
    dataFechamento: caixa.dataFechamento?.toISOString() ?? null,
    valorAbertura: caixa.valorAbertura.toString(),
    valorFechamento: caixa.valorFechamento?.toString() ?? null,
    quebra: caixa.quebra?.toString() ?? null,
    status: caixa.status,
  };
}

/** Colunas exportáveis, iguais às do grid. */
export const CAIXA_EXPORT_DEFINITIONS: readonly ExportColumn<Caixa, CaixaExportColumn>[] = [
  { key: 'id', header: '#', type: 'number', value: (c) => c.numero },
  { key: 'nome', header: 'Nome', value: (c) => c.nome, width: 3 },
  { key: 'operador', header: 'Operador', value: (c) => c.operador, width: 3 },
  { key: 'dataAbertura', header: 'Abertura', type: 'datetime', value: (c) => c.dataAbertura },
  { key: 'dataFechamento', header: 'Fechamento', type: 'datetime', value: (c) => c.dataFechamento },
  { key: 'valorAbertura', header: 'Vl. Abertura', type: 'currency', value: (c) => c.valorAbertura },
  {
    key: 'valorFechamento',
    header: 'Vl. Fechamento',
    type: 'currency',
    value: (c) => c.valorFechamento,
  },
  { key: 'quebra', header: 'Quebra', type: 'currency', value: (c) => c.quebra },
  { key: 'status', header: 'Status', value: (c) => CAIXA_ROTULO_STATUS[c.status] },
];

/** Caixas do Financeiro: abertura e consulta (fechamento e sangrias ficam para outra issue). */
@Injectable()
export class CaixasService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly contexto: RequestContextService,
  ) {}

  async list(query: ListCaixasQuery): Promise<Page<Caixa>> {
    const where = this.where(query);
    const orderBy = this.orderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) => this.txHost.tx.caixa.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.caixa.count({ where }),
    });
    return { ...page, data: page.data.map(toCaixa) };
  }

  /** Abre um caixa para o usuário autenticado. Cada operador só pode ter um caixa aberto. */
  async abrir(input: AbrirCaixaInput): Promise<Caixa> {
    const operadorId = this.contexto.getUserId();
    if (!operadorId) {
      throw new BusinessException('OPERADOR_NAO_IDENTIFICADO', 'Operador não identificado', {
        status: 401,
      });
    }
    const aberto = await this.txHost.tx.caixa.findFirst({
      where: { operadorId, status: 'ABERTO', ...NAO_EXCLUIDOS },
      select: { id: true },
    });
    if (aberto) {
      throw new BusinessException(
        'CAIXA_JA_ABERTO',
        'Você já possui um caixa aberto. Feche-o antes de abrir outro.',
        { status: 409 },
      );
    }
    const caixa = await this.txHost.tx.caixa.create({
      data: { nome: input.nome, valorAbertura: input.valorAbertura, operadorId },
      include: INCLUDE,
    });
    return toCaixa(caixa);
  }

  async export(query: ExportCaixasQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.caixa.count({ where }));
    const rows = await this.txHost.tx.caixa.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      include: INCLUDE,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Caixas',
      filename: 'caixas',
      columns: selectColumns(CAIXA_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map(toCaixa),
    });
  }

  private where(query: Pick<ListCaixasQuery, 'search' | 'status'>): Prisma.CaixaWhereInput {
    return {
      ...NAO_EXCLUIDOS,
      status:
        query.status === undefined ? undefined : query.status === 'aberto' ? 'ABERTO' : 'FECHADO',
      ...(query.search && {
        OR: [
          { nome: { contains: query.search, mode: 'insensitive' } },
          { operador: { nome: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };
  }

  private orderBy(sort: ListCaixasQuery['sort']): Prisma.CaixaOrderByWithRelationInput[] {
    const { field, direction } = sort;
    const principal: Prisma.CaixaOrderByWithRelationInput =
      field === 'operador'
        ? { operador: { nome: direction } }
        : { [field === 'id' ? 'numero' : field]: direction };
    return [principal, { id: direction }];
  }
}
