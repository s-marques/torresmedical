import type { AgendamentoStatus } from '@torres/shared';

export interface HorariosAgendamento {
  chegadaEm: Date | null;
  entradaEm: Date | null;
  finalizadoEm: Date | null;
}

/**
 * Horários gravados a cada mudança de status (issue #147, R §12): chegada ao marcar
 * "Chegou"/"Aguardando", entrada no "Atender" e fim ao finalizar. Devolve só o que muda.
 *
 * - Um horário já gravado não é refeito (marcar "Aguardando" depois de "Chegou" mantém a chegada
 *   original, e o tempo de espera segue contando).
 * - Voltar para um status anterior à chegada (Confirmado, Faltou, Cancelou, Reagendou) apaga a
 *   chegada: quem não veio não tem horário de chegada.
 */
export function horariosDaTransicao(
  atual: HorariosAgendamento,
  status: AgendamentoStatus,
  agora: Date,
): Partial<HorariosAgendamento> {
  switch (status) {
    case 'CHECK_IN':
    case 'AGUARDANDO':
      return atual.chegadaEm ? {} : { chegadaEm: agora };
    case 'EM_ATENDIMENTO':
      return atual.entradaEm ? {} : { entradaEm: agora };
    case 'ATENDIDO':
      return atual.finalizadoEm ? {} : { finalizadoEm: agora };
    default:
      return atual.chegadaEm ? { chegadaEm: null } : {};
  }
}
