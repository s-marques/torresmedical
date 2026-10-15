import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { LookupItem, LookupQuery } from '@torres/shared';
import type { Cargo, Prisma } from '../../../generated/prisma/client';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { searchWhere } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** Cargo dos funcionários (aba "Cargos" da tela Funcionários). */
@Injectable()
export class CargosService extends EntidadeLookupService<
  LookupQuery<'cargos'>,
  Prisma.CargoWhereInput,
  Cargo
> {
  protected readonly naoEncontrado = 'Cargo não encontrado';
  protected readonly fonte: FonteLookup<Prisma.CargoWhereInput, Cargo> = {
    findMany: (args) => this.txHost.tx.cargo.findMany(args),
    count: (args) => this.txHost.tx.cargo.count(args),
    findFirst: (args) => this.txHost.tx.cargo.findFirst(args),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  protected filtro(query: LookupQuery<'cargos'>): Prisma.CargoWhereInput {
    return { ...SELECIONAVEIS, ...searchWhere(query.search, ['nome']) };
  }

  protected toItem(cargo: Cargo): LookupItem {
    return { id: cargo.id, label: cargo.nome, descricao: null };
  }
}
