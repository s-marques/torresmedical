import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CreateUnidadeInput,
  ExportUnidadesQuery,
  ListUnidadesQuery,
  UnidadeExportColumn,
  UpdateUnidadeInput,
} from '@torres/shared';
import type { Prisma, Unidade } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** Colunas exportáveis, iguais às do grid. */
export const UNIDADE_EXPORT_DEFINITIONS: readonly ExportColumn<Unidade, UnidadeExportColumn>[] = [
  { key: 'nome', header: 'Nome', value: (u) => u.nome, width: 3 },
  { key: 'status', header: 'Status', value: (u) => (u.ativo ? 'Ativo' : 'Inativo') },
  { key: 'createdAt', header: 'Criado em', type: 'datetime', value: (u) => u.createdAt },
];

/**
 * Recurso de referência do padrão de API (CLAUDE.md, seção 3): listagem paginada,
 * filtros, ordenação, exportação, escrita auditada e exclusão lógica.
 */
@Injectable()
export class UnidadesService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {}

  list(query: ListUnidadesQuery): Promise<Page<Unidade>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) => this.txHost.tx.unidade.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.unidade.count({ where }),
    });
  }

  async findById(id: string): Promise<Unidade> {
    const unidade = await this.txHost.tx.unidade.findFirst({ where: { id, deletedAt: null } });
    if (!unidade)
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Unidade não encontrada', { status: 404 });
    return unidade;
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
