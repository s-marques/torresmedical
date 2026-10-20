import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CreateTipoAgendamentoInput,
  ListTiposAgendamentoQuery,
  LookupItem,
  LookupQuery,
  UpdateTipoAgendamentoInput,
} from '@torres/shared';
import type { Prisma, TipoAgendamento } from '../../../generated/prisma/client';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
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

  list(query: ListTiposAgendamentoQuery): Promise<Page<TipoAgendamento>> {
    const where: Prisma.TipoAgendamentoWhereInput = {
      deletedAt: null,
      ativo: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['nome']),
    };
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) => this.txHost.tx.tipoAgendamento.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.tipoAgendamento.count({ where }),
    });
  }

  create(input: CreateTipoAgendamentoInput): Promise<TipoAgendamento> {
    return this.txHost.tx.tipoAgendamento.create({ data: input });
  }

  async update(id: string, input: UpdateTipoAgendamentoInput): Promise<TipoAgendamento> {
    await this.findById(id);
    return this.txHost.tx.tipoAgendamento.update({ where: { id }, data: input });
  }

  /**
   * Exclusão lógica. Agendamentos existentes não são afetados (mensagem do diálogo de
   * exclusão no sistema atual); o módulo de agenda deve manter a referência ao tipo.
   */
  async remove(id: string): Promise<TipoAgendamento> {
    await this.findById(id);
    return this.txHost.tx.tipoAgendamento.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
