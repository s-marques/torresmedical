import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { LookupItem, LookupQuery } from '@torres/shared';
import type { Categoria, Prisma } from '../../../generated/prisma/client';
import { EntidadeLookupService, type FonteLookup } from '../../../common/lookups/lookup-query';
import { searchWhere } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { filtroTipoItem, rotuloTipoItem } from '../tipo-item';

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

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
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
