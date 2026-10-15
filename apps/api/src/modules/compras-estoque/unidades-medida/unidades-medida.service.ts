import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { LookupItem, LookupQuery } from '@torres/shared';
import type { Prisma, UnidadeMedida } from '../../../generated/prisma/client';
import { EntidadeLookupService, type FonteLookup } from '../../../common/lookups/lookup-query';
import { searchWhere } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** Unidade de medida dos produtos (botão "Unidades" de Produtos/Serviços). */
@Injectable()
export class UnidadesMedidaService extends EntidadeLookupService<
  LookupQuery<'unidades-medida'>,
  Prisma.UnidadeMedidaWhereInput,
  UnidadeMedida
> {
  protected readonly naoEncontrado = 'Unidade de medida não encontrada';
  protected readonly fonte: FonteLookup<Prisma.UnidadeMedidaWhereInput, UnidadeMedida> = {
    findMany: (args) => this.txHost.tx.unidadeMedida.findMany(args),
    count: (args) => this.txHost.tx.unidadeMedida.count(args),
    findFirst: (args) => this.txHost.tx.unidadeMedida.findFirst(args),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  protected filtro(query: LookupQuery<'unidades-medida'>): Prisma.UnidadeMedidaWhereInput {
    return { deletedAt: null, ...searchWhere(query.search, ['sigla', 'nome']) };
  }

  protected toItem(unidade: UnidadeMedida): LookupItem {
    return { id: unidade.id, label: `${unidade.sigla} – ${unidade.nome}`, descricao: null };
  }
}
