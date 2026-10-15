import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { LookupItem, LookupQuery } from '@torres/shared';
import type { Paciente, Prisma } from '../../../generated/prisma/client';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const CPF_DIGITOS = 11;

/** CPF parcialmente oculto para diferenciar homônimos sem expor o documento: `***.456.789-**`. */
export function mascararCpf(documento: string | null): string | null {
  if (documento?.length !== CPF_DIGITOS) return null;
  return `***.${documento.slice(3, 6)}.${documento.slice(6, 9)}-**`;
}

/** Busca por nome ou pelos dígitos do CPF (aceita `123.456` ou `123456`). */
function buscaPaciente(search: string | undefined): Prisma.PacienteWhereInput {
  if (!search) return {};
  const digitos = search.replaceAll(/\D/g, '');
  const nome: Prisma.PacienteWhereInput = { nome: { contains: search, mode: 'insensitive' } };
  return { OR: digitos ? [nome, { documento: { contains: digitos } }] : [nome] };
}

/** Paciente/Cliente: entidade do módulo Comercial / Atendimento, usada por várias telas. */
@Injectable()
export class PacientesService extends EntidadeLookupService<
  LookupQuery<'pacientes'>,
  Prisma.PacienteWhereInput,
  Paciente
> {
  protected readonly naoEncontrado = 'Paciente não encontrado';
  protected readonly fonte: FonteLookup<Prisma.PacienteWhereInput, Paciente> = {
    findMany: (args) => this.txHost.tx.paciente.findMany(args),
    count: (args) => this.txHost.tx.paciente.count(args),
    findFirst: (args) => this.txHost.tx.paciente.findFirst(args),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  protected filtro(query: LookupQuery<'pacientes'>): Prisma.PacienteWhereInput {
    return { ...SELECIONAVEIS, ...buscaPaciente(query.search) };
  }

  protected toItem(paciente: Paciente): LookupItem {
    return { id: paciente.id, label: paciente.nome, descricao: mascararCpf(paciente.documento) };
  }
}
