import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { LookupItem, LookupQuery } from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import {
  EntidadeLookupService,
  juntarDescricao,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { searchWhere } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const COM_ESPECIALIDADE = { especialidade: { select: { nome: true } } } as const;

/** Profissional com o nome da especialidade. */
export type ProfissionalComEspecialidade = Prisma.ProfissionalGetPayload<{
  include: typeof COM_ESPECIALIDADE;
}>;

/** Profissional (médico, dentista, nutricionista…) do módulo Gestão Profissionais. */
@Injectable()
export class ProfissionaisService extends EntidadeLookupService<
  LookupQuery<'profissionais'>,
  Prisma.ProfissionalWhereInput,
  ProfissionalComEspecialidade
> {
  protected readonly naoEncontrado = 'Profissional não encontrado';
  protected readonly fonte: FonteLookup<
    Prisma.ProfissionalWhereInput,
    ProfissionalComEspecialidade
  > = {
    findMany: (args) =>
      this.txHost.tx.profissional.findMany({ ...args, include: COM_ESPECIALIDADE }),
    count: (args) => this.txHost.tx.profissional.count(args),
    findFirst: (args) =>
      this.txHost.tx.profissional.findFirst({ ...args, include: COM_ESPECIALIDADE }),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  protected filtro(query: LookupQuery<'profissionais'>): Prisma.ProfissionalWhereInput {
    return {
      ...SELECIONAVEIS,
      especialidadeId: query.especialidadeId,
      ...searchWhere(query.search, ['nome', 'registro']),
    };
  }

  /** Total de profissionais ativos (alimenta o painel). */
  contarAtivos(): Promise<number> {
    return this.fonte.count({ where: SELECIONAVEIS });
  }

  protected toItem(profissional: ProfissionalComEspecialidade): LookupItem {
    return {
      id: profissional.id,
      label: profissional.nome,
      descricao: juntarDescricao(profissional.especialidade?.nome, profissional.registro),
    };
  }
}
