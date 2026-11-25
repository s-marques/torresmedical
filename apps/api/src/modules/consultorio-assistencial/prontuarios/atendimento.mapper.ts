import { createHash } from 'node:crypto';
import type {
  Atendimento as AtendimentoDto,
  AtendimentoModelo,
  AtendimentoSnapshot,
  ModeloRespostas,
} from '@torres/shared';
import type { Atendimento as AtendimentoModel } from '../../../generated/prisma/client';

export function toAtendimentoDto(
  atendimento: AtendimentoModel,
  profissionalNome: string | null,
  assinatura: { assinadoPorNome: string | null; totalAdendos: number } = {
    assinadoPorNome: null,
    totalAdendos: 0,
  },
  modelo: AtendimentoModelo | null = null,
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
    modelo,
    respostas: (atendimento.respostas as ModeloRespostas | null | undefined) ?? null,
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
  > &
    Partial<Pick<AtendimentoModel, 'respostas'>>,
  adendos: readonly string[],
): AtendimentoSnapshot {
  const respostas = atendimento.respostas as ModeloRespostas | null | undefined;
  return {
    tipo: atendimento.tipo,
    queixa: atendimento.queixa,
    evolucao: atendimento.evolucao,
    diagnostico: atendimento.diagnostico,
    conduta: atendimento.conduta,
    observacoes: atendimento.observacoes,
    // Só entra quando há modelo: o snapshot (e o hash) dos atendimentos antigos não muda.
    ...(respostas ? { respostas } : {}),
    adendos: [...adendos],
  };
}

/** SHA-256 do snapshot, com as chaves sempre na mesma ordem. */
export function hashDoSnapshot(snapshot: AtendimentoSnapshot): string {
  const base = [
    snapshot.tipo,
    snapshot.queixa,
    snapshot.evolucao,
    snapshot.diagnostico,
    snapshot.conduta,
    snapshot.observacoes,
    snapshot.adendos,
  ];
  // Respostas do modelo (#152) entram no fim, ordenadas pela chave, e só quando existem.
  const respostas = snapshot.respostas
    ? Object.entries(snapshot.respostas).sort(([a], [b]) => a.localeCompare(b))
    : null;
  const canonico = JSON.stringify(respostas ? [...base, respostas] : base);
  return createHash('sha256').update(canonico).digest('hex');
}
