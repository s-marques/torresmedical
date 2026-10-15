import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { LookupItem, LookupQuery } from '@torres/shared';
import type { Prisma, Produto } from '../../../generated/prisma/client';
import {
  EntidadeLookupService,
  juntarDescricao,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { searchWhere } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { filtroTipoItem, rotuloTipoItem } from '../tipo-item';

/** Produto ou serviço do catálogo (Vendas, Orçamentos, Pacotes, Estoque, Lotes, Baixa de Insumos). */
@Injectable()
export class ProdutosService extends EntidadeLookupService<
  LookupQuery<'produtos'>,
  Prisma.ProdutoWhereInput,
  Produto
> {
  protected readonly naoEncontrado = 'Produto não encontrado';
  protected readonly fonte: FonteLookup<Prisma.ProdutoWhereInput, Produto> = {
    findMany: (args) => this.txHost.tx.produto.findMany(args),
    count: (args) => this.txHost.tx.produto.count(args),
    findFirst: (args) => this.txHost.tx.produto.findFirst(args),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  protected filtro(query: LookupQuery<'produtos'>): Prisma.ProdutoWhereInput {
    return {
      ...SELECIONAVEIS,
      tipo: filtroTipoItem(query.tipo),
      ...searchWhere(query.search, ['nome', 'codigo']),
    };
  }

  protected toItem(produto: Produto): LookupItem {
    return {
      id: produto.id,
      label: produto.nome,
      descricao: juntarDescricao(rotuloTipoItem(produto.tipo), produto.codigo),
    };
  }
}
