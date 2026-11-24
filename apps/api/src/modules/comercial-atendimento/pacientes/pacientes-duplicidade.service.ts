import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  PACIENTE_POSSIVEL_DUPLICADO,
  type PacienteDuplicidadeMotivo,
  type PacientePossivelDuplicado,
  type VerificacaoDuplicidadePaciente,
  type VerificarDuplicidadePaciente,
} from '@torres/shared';
import { AuditService } from '../../../common/audit/audit.service';
import { DadosSensiveisService } from '../../../common/auth/dados-sensiveis.service';
import { BusinessException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { Prisma } from '../../../generated/prisma/client';
import { PacientesVinculadosService } from '../../consultorio-assistencial/pacientes-vinculados/pacientes-vinculados.service';
import { mascararCpf } from './mascarar-cpf';

export const ENTIDADE_DUPLICIDADE = 'PacienteDuplicidade';
const LIMITE_CANDIDATOS = 20;
const LIMITE_BUSCA = 200;

/** Dados que identificam o paciente, já normalizados para comparar. */
interface Chaves {
  telefones: string[];
  email: string | null;
  nome: string | null;
  nascimento: string | null;
}

type Fonte = Partial<
  Pick<VerificarDuplicidadePaciente, 'nome' | 'email' | 'telefone' | 'celular' | 'dataNascimento'>
>;

const somenteDigitos = (valor: string | null | undefined): string =>
  (valor ?? '').replaceAll(/\D/g, '');

/** Minúsculas, sem acento e com espaços simples: `"  JOSÉ  da Silva"` → `"jose da silva"`. */
export function normalizarNome(nome: string | null | undefined): string {
  return (nome ?? '')
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function chavesDe(fonte: Fonte): Chaves {
  const telefones = [...new Set([fonte.telefone, fonte.celular].map(somenteDigitos))].filter(
    (t) => t.length > 0,
  );
  return {
    telefones,
    email: fonte.email?.trim().toLowerCase() || null,
    nome: normalizarNome(fonte.nome) || null,
    nascimento: fonte.dataNascimento ?? null,
  };
}

/**
 * Possível cadastro duplicado de paciente (issue #149; requisito do cliente, seção 9 do
 * "Rastreio de dificuldades do DrIntelli"): telefone, e-mail ou nome + data de nascimento.
 * É só um alerta: o CPF/CNPJ igual continua bloqueando em `PacientesService.validar`.
 *
 * A busca respeita o escopo de dados por profissional (issue #153) e o CPF mascarado só vai
 * para quem tem `verDadosSensiveis`.
 */
@Injectable()
export class PacientesDuplicidadeService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly vinculados: PacientesVinculadosService,
    private readonly sensiveis: DadosSensiveisService,
    private readonly audit: AuditService,
  ) {}

  /** `POST /pacientes/duplicidade`: a mesma regra que `create`/`update` aplicam ao gravar. */
  async verificar(input: VerificarDuplicidadePaciente): Promise<VerificacaoDuplicidadePaciente> {
    return { candidatos: await this.candidatos(input, input.pacienteId ?? undefined) };
  }

  /**
   * Garante que o usuário viu o alerta: sem `confirmado`, um possível duplicado vira 409. Devolve
   * os candidatos (vazio quando não há) para `registrarConfirmacao` depois de gravar.
   */
  async exigirConfirmacao(
    input: Fonte,
    confirmado: boolean | undefined,
    pacienteId?: string,
  ): Promise<PacientePossivelDuplicado[]> {
    const candidatos = await this.candidatos(input, pacienteId);
    if (candidatos.length > 0 && !confirmado) {
      throw new BusinessException(
        PACIENTE_POSSIVEL_DUPLICADO,
        'Paciente possivelmente já cadastrado. Deseja abrir o registro existente?',
        { status: 409 },
      );
    }
    return candidatos;
  }

  /** Quem escolheu "Continuar cadastro" e sobre quais registros (o usuário vem do contexto). */
  async registrarConfirmacao(
    pacienteId: string,
    candidatos: readonly PacientePossivelDuplicado[],
  ): Promise<void> {
    if (candidatos.length === 0) return;
    await this.audit.record({
      action: 'CREATE',
      entity: ENTIDADE_DUPLICIDADE,
      entityId: pacienteId,
      after: {
        duplicidadeConfirmada: true,
        possiveisDuplicados: candidatos.map(({ id, motivos }) => ({ id, motivos })),
      },
    });
  }

  private async candidatos(
    input: Fonte,
    pacienteId?: string,
  ): Promise<PacientePossivelDuplicado[]> {
    const chaves = await this.chavesAlteradas(chavesDe(input), pacienteId);
    const criterios = this.criterios(chaves);
    if (criterios.length === 0) return [];

    const ids = await this.vinculados.idsNoEscopo();
    const linhas = await this.txHost.tx.paciente.findMany({
      where: {
        deletedAt: null,
        AND: [
          { OR: criterios },
          ...(pacienteId ? [{ id: { not: pacienteId } }] : []),
          ...(ids === null ? [] : [{ id: { in: ids } }]),
        ],
      },
      select: {
        id: true,
        nome: true,
        documento: true,
        dataNascimento: true,
        telefone: true,
        celular: true,
        email: true,
      },
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      take: LIMITE_BUSCA,
    });

    const ocultar = !this.sensiveis.permitido();
    return linhas
      .map((linha) => {
        const nascimento = linha.dataNascimento?.toISOString().slice(0, 10) ?? null;
        return { linha, nascimento, motivos: this.motivos(chaves, { ...linha, nascimento }) };
      })
      .filter(({ motivos }) => motivos.length > 0)
      .slice(0, LIMITE_CANDIDATOS)
      .map(({ linha, nascimento, motivos }) => ({
        id: linha.id,
        nome: linha.nome,
        cpfMascarado: ocultar ? null : mascararCpf(linha.documento),
        dataNascimento: nascimento,
        motivos,
      }));
  }

  /**
   * Na edição só conta o que mudou: quem já tem um cadastro parecido não precisa confirmar de
   * novo a cada alteração de outros campos.
   */
  private async chavesAlteradas(chaves: Chaves, pacienteId?: string): Promise<Chaves> {
    if (!pacienteId) return chaves;
    const atual = await this.txHost.tx.paciente.findFirst({
      where: { id: pacienteId, deletedAt: null },
      select: { nome: true, email: true, telefone: true, celular: true, dataNascimento: true },
    });
    if (!atual) return chaves;
    const anterior = chavesDe({
      ...atual,
      dataNascimento: atual.dataNascimento?.toISOString().slice(0, 10) ?? null,
    });
    const mudouNomeNascimento =
      chaves.nome !== anterior.nome || chaves.nascimento !== anterior.nascimento;
    return {
      telefones: chaves.telefones.filter((t) => !anterior.telefones.includes(t)),
      email: chaves.email === anterior.email ? null : chaves.email,
      nome: mudouNomeNascimento ? chaves.nome : null,
      nascimento: mudouNomeNascimento ? chaves.nascimento : null,
    };
  }

  private criterios(chaves: Chaves): Prisma.PacienteWhereInput[] {
    const criterios: Prisma.PacienteWhereInput[] = [];
    if (chaves.telefones.length > 0) {
      criterios.push({ telefone: { in: chaves.telefones } }, { celular: { in: chaves.telefones } });
    }
    if (chaves.email) criterios.push({ email: { equals: chaves.email, mode: 'insensitive' } });
    if (chaves.nome && chaves.nascimento) {
      criterios.push({ dataNascimento: new Date(`${chaves.nascimento}T00:00:00.000Z`) });
    }
    return criterios;
  }

  private motivos(
    chaves: Chaves,
    linha: {
      nome: string;
      telefone: string | null;
      celular: string | null;
      email: string | null;
      nascimento: string | null;
    },
  ): PacienteDuplicidadeMotivo[] {
    const motivos: PacienteDuplicidadeMotivo[] = [];
    const telefones = [linha.telefone, linha.celular].map(somenteDigitos);
    if (chaves.telefones.some((t) => telefones.includes(t))) motivos.push('TELEFONE');
    if (chaves.email && linha.email?.trim().toLowerCase() === chaves.email) motivos.push('EMAIL');
    if (
      chaves.nome &&
      chaves.nascimento &&
      linha.nascimento === chaves.nascimento &&
      normalizarNome(linha.nome) === chaves.nome
    ) {
      motivos.push('NOME_NASCIMENTO');
    }
    return motivos;
  }
}
