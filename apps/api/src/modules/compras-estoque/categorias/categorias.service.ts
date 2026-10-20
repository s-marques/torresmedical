import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CategoriaExportColumn,
  CreateCategoriaInput,
  ExportCategoriasQuery,
  ListCategoriasQuery,
  LookupItem,
  LookupQuery,
  UpdateCategoriaInput,
} from '@torres/shared';
import type { Categoria, Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { EntidadeLookupService, type FonteLookup } from '../../../common/lookups/lookup-query';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { filtroTipoItem, rotuloTipoItem, TIPO_ITEM } from '../tipo-item';

const NAO_EXCLUIDAS = { deletedAt: null } as const;

/** Colunas exportáveis, iguais às do grid. */
export const CATEGORIA_EXPORT_DEFINITIONS: readonly ExportColumn<
  Categoria,
  CategoriaExportColumn
>[] = [
  { key: 'nome', header: 'Nome', value: (c) => c.nome, width: 3 },
  { key: 'tipo', header: 'Tipo', value: (c) => rotuloTipoItem(c.tipo) },
  { key: 'cor', header: 'Cor', value: (c) => c.cor ?? '' },
  { key: 'descricao', header: 'Descrição', value: (c) => c.descricao ?? '', width: 3 },
];

/** Categoria de produtos ou serviços. Não tem status no inventário: só sai ao ser excluída. */
@Injectable()
export class CategoriasService extends EntidadeLookupService<
  LookupQuery<'categorias'>,
  Prisma.CategoriaWhereInput,
  Categoria
> {
  protected readonly naoEncontrado = 'Categoria não encontrada';
  protected readonly fonte: FonteLookup<Prisma.CategoriaWhereInput, Categoria> = {
    findMany: (args) => this.txHost.tx.categoria.findMany(args),
    count: (args) => this.txHost.tx.categoria.count(args),
    findFirst: (args) => this.txHost.tx.categoria.findFirst(args),
  };

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {
    super();
  }

  list(query: ListCategoriasQuery): Promise<Page<Categoria>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) => this.txHost.tx.categoria.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.categoria.count({ where }),
    });
  }

  /** Nome repetido é permitido: o sistema atual aceita (confirmado pelo dev na issue #18). */
  create(input: CreateCategoriaInput): Promise<Categoria> {
    return this.txHost.tx.categoria.create({ data: this.dados(input) });
  }

  async update(id: string, input: UpdateCategoriaInput): Promise<Categoria> {
    await this.findById(id);
    return this.txHost.tx.categoria.update({ where: { id }, data: this.dados(input) });
  }

  /** Exclusão lógica. Só é possível se nenhum produto ou serviço usar a categoria. */
  async remove(id: string): Promise<Categoria> {
    await this.findById(id);
    const emUso = await this.txHost.tx.produto.count({
      where: { categoriaId: id, ...NAO_EXCLUIDAS },
    });
    if (emUso > 0) {
      throw new BusinessException(
        'CATEGORIA_EM_USO',
        'Não é possível excluir: há produtos ou serviços usando esta categoria.',
        { status: 409 },
      );
    }
    return this.txHost.tx.categoria.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async export(query: ExportCategoriasQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.categoria.count({ where }));
    const rows = await this.txHost.tx.categoria.findMany({
      where,
      orderBy: toOrderBy(query.sort),
    });
    return this.exportService.export({
      format: query.format,
      title: 'Categorias',
      filename: 'categorias',
      columns: selectColumns(CATEGORIA_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  private where(query: Pick<ListCategoriasQuery, 'search' | 'tipo'>): Prisma.CategoriaWhereInput {
    return {
      ...NAO_EXCLUIDAS,
      tipo: filtroTipoItem(query.tipo),
      ...searchWhere(query.search, ['nome', 'descricao']),
    };
  }

  private dados(input: CreateCategoriaInput): Prisma.CategoriaUncheckedCreateInput {
    return {
      nome: input.nome,
      tipo: TIPO_ITEM[input.tipo],
      cor: input.cor,
      descricao: input.descricao,
    };
  }

  protected filtro(query: LookupQuery<'categorias'>): Prisma.CategoriaWhereInput {
    return {
      deletedAt: null,
      tipo: filtroTipoItem(query.tipo),
      ...searchWhere(query.search, ['nome']),
    };
  }

  protected toItem(categoria: Categoria): LookupItem {
    return { id: categoria.id, label: categoria.nome, descricao: rotuloTipoItem(categoria.tipo) };
  }
}
