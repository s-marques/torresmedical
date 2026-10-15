import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { LookupItem, LookupQuery } from '@torres/shared';
import type { Especialidade, Prisma } from '../../../generated/prisma/client';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { searchWhere } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** Especialidade dos profissionais (botão "Especialidades" da tela Profissionais). */
@Injectable()
export class EspecialidadesService extends EntidadeLookupService<
  LookupQuery<'especialidades'>,
  Prisma.EspecialidadeWhereInput,
  Especialidade
> {
  protected readonly naoEncontrado = 'Especialidade não encontrada';
  protected readonly fonte: FonteLookup<Prisma.EspecialidadeWhereInput, Especialidade> = {
    findMany: (args) => this.txHost.tx.especialidade.findMany(args),
    count: (args) => this.txHost.tx.especialidade.count(args),
    findFirst: (args) => this.txHost.tx.especialidade.findFirst(args),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  protected filtro(query: LookupQuery<'especialidades'>): Prisma.EspecialidadeWhereInput {
    return { ...SELECIONAVEIS, ...searchWhere(query.search, ['nome']) };
  }

  protected toItem(especialidade: Especialidade): LookupItem {
    return { id: especialidade.id, label: especialidade.nome, descricao: null };
  }
}
