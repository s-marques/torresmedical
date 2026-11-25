import { createHash } from 'node:crypto';
import type { Atendimento as AtendimentoDto, AtendimentoSnapshot } from '@torres/shared';
import type { Atendimento as AtendimentoModel } from '../../../generated/prisma/client';

export function toAtendimentoDto(
  atendimento: AtendimentoModel,
  profissionalNome: string | null,
  assinatura: { assinadoPorNome: string | null; totalAdendos: number } = {
    assinadoPorNome: null,
    totalAdendos: 0,
  },
): AtendimentoDto {
  return {
    id: atendimento.id,
    pacienteId: atendimento.pacienteId,
    profissionalId: atendimento.profissionalId,
    profissionalNome,
    tipo: atendimento.tipo,
    queixa: atendimento.queixa,
    evolucao: atendimento.evolucao,
    diagnostico: atendimento.diagnostico,
    conduta: atendimento.conduta,
    observacoes: atendimento.observacoes,
    status: atendimento.status,
    assinadoEm: atendimento.assinadoEm ? atendimento.assinadoEm.toISOString() : null,
    assinadoPorNome: assinatura.assinadoPorNome,
    totalAdendos: assinatura.totalAdendos,
    createdAt: atendimento.createdAt.toISOString(),
    updatedAt: atendimento.updatedAt.toISOString(),
  };
}

/** Conteúdo clínico do atendimento mais os adendos já registrados. */
export function snapshotDoAtendimento(
  atendimento: Pick<
    AtendimentoModel,
    'tipo' | 'queixa' | 'evolucao' | 'diagnostico' | 'conduta' | 'observacoes'
  >,
  adendos: readonly string[],
): AtendimentoSnapshot {
  return {
    tipo: atendimento.tipo,
    queixa: atendimento.queixa,
    evolucao: atendimento.evolucao,
    diagnostico: atendimento.diagnostico,
    conduta: atendimento.conduta,
    observacoes: atendimento.observacoes,
    adendos: [...adendos],
  };
}

/** SHA-256 do snapshot, com as chaves sempre na mesma ordem. */
export function hashDoSnapshot(snapshot: AtendimentoSnapshot): string {
  const canonico = JSON.stringify([
    snapshot.tipo,
    snapshot.queixa,
    snapshot.evolucao,
    snapshot.diagnostico,
    snapshot.conduta,
    snapshot.observacoes,
    snapshot.adendos,
  ]);
  return createHash('sha256').update(canonico).digest('hex');
}
