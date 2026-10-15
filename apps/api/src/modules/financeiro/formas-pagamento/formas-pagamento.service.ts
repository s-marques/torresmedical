import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { FinalidadePagamento, LookupItem, LookupQuery } from '@torres/shared';
import type {
  FinalidadePagamento as FinalidadePagamentoPrisma,
  FormaPagamento,
  Prisma,
} from '../../../generated/prisma/client';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { searchWhere } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const FINALIDADE: Readonly<Record<FinalidadePagamento, FinalidadePagamentoPrisma>> = {
  receber: 'RECEBER',
  pagar: 'PAGAR',
};

const ROTULO_FINALIDADE: Readonly<Record<FinalidadePagamentoPrisma, string>> = {
  RECEBER: 'Receber',
  PAGAR: 'Pagar',
};

/** Forma de pagamento do Financeiro (Vendas, Caixas, Contas, Receita Profissionais). */
@Injectable()
export class FormasPagamentoService extends EntidadeLookupService<
  LookupQuery<'formas-pagamento'>,
  Prisma.FormaPagamentoWhereInput,
  FormaPagamento
> {
  protected readonly naoEncontrado = 'Forma de pagamento não encontrada';
  protected readonly fonte: FonteLookup<Prisma.FormaPagamentoWhereInput, FormaPagamento> = {
    findMany: (args) => this.txHost.tx.formaPagamento.findMany(args),
    count: (args) => this.txHost.tx.formaPagamento.count(args),
    findFirst: (args) => this.txHost.tx.formaPagamento.findFirst(args),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  protected filtro(query: LookupQuery<'formas-pagamento'>): Prisma.FormaPagamentoWhereInput {
    return {
      ...SELECIONAVEIS,
      finalidade: query.finalidade ? FINALIDADE[query.finalidade] : undefined,
      ...searchWhere(query.search, ['nome']),
    };
  }

  protected toItem(forma: FormaPagamento): LookupItem {
    return { id: forma.id, label: forma.nome, descricao: ROTULO_FINALIDADE[forma.finalidade] };
  }
}
