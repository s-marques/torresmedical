import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { LookupItem, LookupQuery } from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { searchWhere } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const COM_CARGO = { cargo: { select: { nome: true } } } as const;

/** Funcionário com o nome do cargo. */
export type FuncionarioComCargo = Prisma.FuncionarioGetPayload<{ include: typeof COM_CARGO }>;

/** Funcionário do módulo Regulatório / Qualidade (Treinamentos, Contas a Pagar, Coleta de Resíduos). */
@Injectable()
export class FuncionariosService extends EntidadeLookupService<
  LookupQuery<'funcionarios'>,
  Prisma.FuncionarioWhereInput,
  FuncionarioComCargo
> {
  protected readonly naoEncontrado = 'Funcionário não encontrado';
  protected readonly fonte: FonteLookup<Prisma.FuncionarioWhereInput, FuncionarioComCargo> = {
    findMany: (args) => this.txHost.tx.funcionario.findMany({ ...args, include: COM_CARGO }),
    count: (args) => this.txHost.tx.funcionario.count(args),
    findFirst: (args) => this.txHost.tx.funcionario.findFirst({ ...args, include: COM_CARGO }),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  protected filtro(query: LookupQuery<'funcionarios'>): Prisma.FuncionarioWhereInput {
    return { ...SELECIONAVEIS, ...searchWhere(query.search, ['nome']) };
  }

  protected toItem(funcionario: FuncionarioComCargo): LookupItem {
    return {
      id: funcionario.id,
      label: funcionario.nome,
      descricao: funcionario.cargo?.nome ?? null,
    };
  }
}
