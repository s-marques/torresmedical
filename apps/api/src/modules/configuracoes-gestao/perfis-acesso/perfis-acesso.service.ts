import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  permissaoDaPagina,
  TOTAL_PAGINAS_SISTEMA,
  type CreatePerfilInput,
  type ExportPerfisQuery,
  type ListPerfisQuery,
  type Perfil as PerfilDto,
  type PerfilExportColumn,
  type UpdatePerfilInput,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const INCLUDE = { permissoes: true } satisfies Prisma.PerfilInclude;
type PerfilComPermissoes = Prisma.PerfilGetPayload<{ include: typeof INCLUDE }>;

/** Colunas exportáveis, iguais às do grid. */
export const PERFIL_EXPORT_DEFINITIONS: readonly ExportColumn<PerfilDto, PerfilExportColumn>[] = [
  { key: 'nome', header: 'Nome', value: (p) => p.nome, width: 3 },
  { key: 'descricao', header: 'Descrição', value: (p) => p.descricao ?? '', width: 3 },
  {
    key: 'paginas',
    header: 'Páginas',
    value: (p) => `${p.paginasPermitidas.length} de ${TOTAL_PAGINAS_SISTEMA} páginas`,
    width: 2,
  },
  { key: 'status', header: 'Status', value: (p) => (p.ativo ? 'Ativo' : 'Inativo') },
];

/**
 * Perfis de Acesso (`/perfis`): o conjunto de páginas (permissão `.ver`) que um perfil libera
 * para os seus usuários. Cada página marcada vira uma linha em `PerfilPermissao`.
 */
@Injectable()
export class PerfisAcessoService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {}

  list(query: ListPerfisQuery): Promise<Page<PerfilDto>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: async (page) => {
        const perfis = await this.txHost.tx.perfil.findMany({
          where,
          orderBy,
          include: INCLUDE,
          ...page,
        });
        return perfis.map((perfil) => this.toDto(perfil));
      },
      count: () => this.txHost.tx.perfil.count({ where }),
    });
  }

  async findById(id: string): Promise<PerfilDto> {
    return this.toDto(await this.buscar(id));
  }

  async create(input: CreatePerfilInput): Promise<PerfilDto> {
    const criado = await this.txHost.tx.perfil.create({
      data: {
        nome: input.nome,
        descricao: input.descricao,
        permissoes: { create: this.permissoes(input.paginasPermitidas) },
      },
      include: INCLUDE,
    });
    return this.toDto(criado);
  }

  async update(id: string, input: UpdatePerfilInput): Promise<PerfilDto> {
    await this.buscar(id);
    const alterado = await this.txHost.tx.perfil.update({
      where: { id },
      data: {
        nome: input.nome,
        descricao: input.descricao,
        permissoes: { deleteMany: {}, create: this.permissoes(input.paginasPermitidas) },
      },
      include: INCLUDE,
    });
    return this.toDto(alterado);
  }

  /** Exclusão lógica: perfis em uso (`onDelete: Restrict`) mantêm a referência ao excluído. */
  async remove(id: string): Promise<PerfilDto> {
    await this.buscar(id);
    const removido = await this.txHost.tx.perfil.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: INCLUDE,
    });
    return this.toDto(removido);
  }

  async export(query: ExportPerfisQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.perfil.count({ where }));
    const perfis = await this.txHost.tx.perfil.findMany({
      where,
      orderBy: toOrderBy(query.sort),
      include: INCLUDE,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Perfis de Acesso',
      filename: 'perfis',
      columns: selectColumns(PERFIL_EXPORT_DEFINITIONS, query.columns),
      rows: perfis.map((perfil) => this.toDto(perfil)),
    });
  }

  private permissoes(
    paginas: CreatePerfilInput['paginasPermitidas'],
  ): Prisma.PerfilPermissaoCreateWithoutPerfilInput[] {
    return paginas.map((pagina) => ({ permissao: permissaoDaPagina(pagina) }));
  }

  private toDto(perfil: PerfilComPermissoes): PerfilDto {
    return {
      id: perfil.id,
      nome: perfil.nome,
      descricao: perfil.descricao,
      paginasPermitidas: perfil.permissoes.map((item) => item.permissao.replace(/\.ver$/, '')),
      ativo: perfil.ativo,
      createdAt: perfil.createdAt.toISOString(),
      updatedAt: perfil.updatedAt.toISOString(),
    };
  }

  private async buscar(id: string): Promise<PerfilComPermissoes> {
    const perfil = await this.txHost.tx.perfil.findFirst({
      where: { id, deletedAt: null },
      include: INCLUDE,
    });
    if (!perfil) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Perfil não encontrado', { status: 404 });
    }
    return perfil;
  }

  private where(query: Pick<ListPerfisQuery, 'search' | 'status'>): Prisma.PerfilWhereInput {
    return {
      deletedAt: null,
      ativo: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['nome']),
    };
  }
}
