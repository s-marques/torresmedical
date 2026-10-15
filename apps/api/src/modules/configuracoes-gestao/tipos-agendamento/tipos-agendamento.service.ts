import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { LookupItem, LookupQuery } from '@torres/shared';
import type { Prisma, TipoAgendamento } from '../../../generated/prisma/client';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { searchWhere } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** Tipo de consulta/procedimento da agenda (tela Tipos de Agendamento). */
@Injectable()
export class TiposAgendamentoService extends EntidadeLookupService<
  LookupQuery<'tipos-agendamento'>,
  Prisma.TipoAgendamentoWhereInput,
  TipoAgendamento
> {
  protected readonly naoEncontrado = 'Tipo de agendamento não encontrado';
  protected readonly fonte: FonteLookup<Prisma.TipoAgendamentoWhereInput, TipoAgendamento> = {
    findMany: (args) => this.txHost.tx.tipoAgendamento.findMany(args),
    count: (args) => this.txHost.tx.tipoAgendamento.count(args),
    findFirst: (args) => this.txHost.tx.tipoAgendamento.findFirst(args),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  protected filtro(query: LookupQuery<'tipos-agendamento'>): Prisma.TipoAgendamentoWhereInput {
    return { ...SELECIONAVEIS, ...searchWhere(query.search, ['nome']) };
  }

  protected toItem(tipo: TipoAgendamento): LookupItem {
    return { id: tipo.id, label: tipo.nome, descricao: `${tipo.duracaoMinutos} min` };
  }
}
