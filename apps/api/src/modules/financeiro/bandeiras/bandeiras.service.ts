import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { CreateBandeiraInput, ListBandeirasQuery } from '@torres/shared';
import type { Bandeira, Prisma } from '../../../generated/prisma/client';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** Bandeira de cartão (aba Bandeiras de Formas de Pagamento). */
@Injectable()
export class BandeirasService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  list(query: ListBandeirasQuery): Promise<Page<Bandeira>> {
    const where: Prisma.BandeiraWhereInput = {
      deletedAt: null,
      ...searchWhere(query.search, ['nome']),
    };
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) => this.txHost.tx.bandeira.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.bandeira.count({ where }),
    });
  }

  create(input: CreateBandeiraInput): Promise<Bandeira> {
    return this.txHost.tx.bandeira.create({ data: input });
  }
}
