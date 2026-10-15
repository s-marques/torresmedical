import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { LookupItem, LookupQuery } from '@torres/shared';
import type { Fornecedor, Prisma } from '../../../generated/prisma/client';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { searchWhere } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** `Cuiabá/MT`, `Cuiabá` ou `MT`, conforme o que estiver preenchido. */
export function cidadeUf(fornecedor: Pick<Fornecedor, 'cidade' | 'uf'>): string | null {
  const partes = [fornecedor.cidade, fornecedor.uf].filter(Boolean);
  return partes.length > 0 ? partes.join('/') : null;
}

/** Fornecedor do módulo Compras / Estoque (Entrada de Compras, Pedidos, Contas a Pagar). */
@Injectable()
export class FornecedoresService extends EntidadeLookupService<
  LookupQuery<'fornecedores'>,
  Prisma.FornecedorWhereInput,
  Fornecedor
> {
  protected readonly naoEncontrado = 'Fornecedor não encontrado';
  protected readonly fonte: FonteLookup<Prisma.FornecedorWhereInput, Fornecedor> = {
    findMany: (args) => this.txHost.tx.fornecedor.findMany(args),
    count: (args) => this.txHost.tx.fornecedor.count(args),
    findFirst: (args) => this.txHost.tx.fornecedor.findFirst(args),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  protected filtro(query: LookupQuery<'fornecedores'>): Prisma.FornecedorWhereInput {
    return { ...SELECIONAVEIS, ...searchWhere(query.search, ['nome', 'documento']) };
  }

  protected toItem(fornecedor: Fornecedor): LookupItem {
    return { id: fornecedor.id, label: fornecedor.nome, descricao: cidadeUf(fornecedor) };
  }
}
