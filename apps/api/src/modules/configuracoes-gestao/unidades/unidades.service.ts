import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  AtivoStatus,
  CreateUnidadeInput,
  ExportUnidadesQuery,
  ListUnidadesQuery,
  LookupItem,
  LookupQuery,
  Sort,
  UnidadeExportColumn,
  UpdateUnidadeInput,
} from '@torres/shared';
import type { Prisma, Unidade } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** Colunas exportáveis, iguais às do grid. */
export const UNIDADE_EXPORT_DEFINITIONS: readonly ExportColumn<Unidade, UnidadeExportColumn>[] = [
  { key: 'nome', header: 'Nome', value: (u) => u.nome, width: 3 },
  { key: 'status', header: 'Status', value: (u) => (u.ativo ? 'Ativo' : 'Inativo') },
  { key: 'createdAt', header: 'Criado em', type: 'datetime', value: (u) => u.createdAt },
];

export interface FiltroCadastradas {
  intervalo: { gte: Date; lt: Date };
  status?: AtivoStatus;
}

/**
 * Recurso de referência do padrão de API (CLAUDE.md, seção 3): listagem paginada,
 * filtros, ordenação, exportação, escrita auditada e exclusão lógica. Também é entidade
 * compartilhada: expõe o lookup (`/api/lookups/unidades`) e o `findById` para outros módulos.
 */
@Injectable()
export class UnidadesService extends EntidadeLookupService<
  LookupQuery<'unidades'>,
  Prisma.UnidadeWhereInput,
  Unidade
> {
  protected readonly naoEncontrado = 'Unidade não encontrada';
  protected readonly fonte: FonteLookup<Prisma.UnidadeWhereInput, Unidade> = {
    findMany: (args) => this.txHost.tx.unidade.findMany(args),
    count: (args) => this.txHost.tx.unidade.count(args),
    findFirst: (args) => this.txHost.tx.unidade.findFirst(args),
  };

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {
    super();
  }

  protected filtro(query: LookupQuery<'unidades'>): Prisma.UnidadeWhereInput {
    return {
      ...SELECIONAVEIS,
      empresaId: query.empresaId,
      ...searchWhere(query.search, ['nome']),
    };
  }

  protected toItem(unidade: Unidade): LookupItem {
    return { id: unidade.id, label: unidade.nome, descricao: null };
  }

  list(query: ListUnidadesQuery): Promise<Page<Unidade>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) => this.txHost.tx.unidade.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.unidade.count({ where }),
    });
  }

  async create(input: CreateUnidadeInput): Promise<Unidade> {
    await this.ensureEmpresaExists(input.empresaId);
    await this.ensureNomeDisponivel(input.empresaId, input.nome);
    return this.txHost.tx.unidade.create({ data: input });
  }

  async update(id: string, input: UpdateUnidadeInput): Promise<Unidade> {
    const atual = await this.findById(id);
    if (input.nome !== undefined) await this.ensureNomeDisponivel(atual.empresaId, input.nome, id);
    return this.txHost.tx.unidade.update({ where: { id }, data: input });
  }

  /** Exclusão lógica: a unidade pode estar referenciada por dados financeiros e clínicos. */
  async remove(id: string): Promise<Unidade> {
    await this.findById(id);
    return this.txHost.tx.unidade.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async export(query: ExportUnidadesQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.unidade.count({ where }));
    const rows = await this.txHost.tx.unidade.findMany({ where, orderBy: toOrderBy(query.sort) });
    return this.exportService.export({
      format: query.format,
      title: 'Unidades',
      filename: 'unidades',
      columns: selectColumns(UNIDADE_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  /** Relatório de exemplo (EX-01): unidades cadastradas no intervalo, sem as excluídas. */
  cadastradasNoPeriodo(
    filtro: FiltroCadastradas,
    sort: Sort<UnidadeExportColumn>,
    pagina?: { skip: number; take: number },
  ): Promise<Unidade[]> {
    return this.txHost.tx.unidade.findMany({
      where: this.whereCadastradas(filtro),
      orderBy: toOrderBy(sort, { status: 'ativo' }),
      ...pagina,
    });
  }

  contarCadastradasNoPeriodo(filtro: FiltroCadastradas): Promise<number> {
    return this.txHost.tx.unidade.count({ where: this.whereCadastradas(filtro) });
  }

  private whereCadastradas({ intervalo, status }: FiltroCadastradas): Prisma.UnidadeWhereInput {
    return { ...this.where({ status, search: undefined }), createdAt: intervalo };
  }

  private where(
    query: Pick<ListUnidadesQuery, 'search' | 'status' | 'empresaId'>,
  ): Prisma.UnidadeWhereInput {
    return {
      deletedAt: null,
      empresaId: query.empresaId,
      ativo: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['nome']),
    };
  }

  private async ensureEmpresaExists(empresaId: string): Promise<void> {
    const empresa = await this.txHost.tx.empresa.findFirst({
      where: { id: empresaId, deletedAt: null },
      select: { id: true },
    });
    if (!empresa) {
      throw new BusinessException('EMPRESA_NAO_ENCONTRADA', 'Empresa não encontrada', {
        details: [{ field: 'empresaId', message: 'Empresa não encontrada' }],
      });
    }
  }

  private async ensureNomeDisponivel(
    empresaId: string,
    nome: string,
    ignorarId?: string,
  ): Promise<void> {
    const existente = await this.txHost.tx.unidade.findFirst({
      where: {
        empresaId,
        deletedAt: null,
        nome: { equals: nome, mode: 'insensitive' },
        id: ignorarId ? { not: ignorarId } : undefined,
      },
      select: { id: true },
    });
    if (existente) {
      throw new BusinessException('UNIDADE_DUPLICADA', 'Já existe uma unidade com este nome', {
        status: 409,
        details: [{ field: 'nome', message: 'Já existe uma unidade com este nome' }],
      });
    }
  }
}
