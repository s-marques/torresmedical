import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';
import { agendamentoStatusSchema, type AgendamentoStatus } from './agendamento';

/**
 * Tela Recepção (`/recepcao`, issue #147, R §7 e §12): "Atendimentos de hoje" com status rápidos,
 * horários de chegada, entrada e finalização e a fila de espera. Não traz conteúdo clínico.
 */

/**
 * Status que a recepção aplica pelos botões rápidos (decisão do dev na #147): "Chegou" é
 * `CHECK_IN`, "Aguardando" é um botão manual e "Em atendimento" é do médico (o "Atender" da #38).
 * "Finalizado" também vem do médico (`Finalizar`), então a recepção só o vê.
 */
export const RECEPCAO_STATUS_ACAO = [
  'CONFIRMADO',
  'CHECK_IN',
  'AGUARDANDO',
  'FALTOU',
  'CANCELADO',
  'REAGENDAR',
] as const satisfies readonly AgendamentoStatus[];
export type RecepcaoStatusAcao = (typeof RECEPCAO_STATUS_ACAO)[number];

/** Status em que a recepção não muda mais nada: o atendimento já é do médico ou terminou. */
export const RECEPCAO_STATUS_TRAVADOS = [
  'EM_ATENDIMENTO',
  'ATENDIDO',
] as const satisfies readonly AgendamentoStatus[];

/** Status em que o paciente já está na clínica (contam a espera). */
export const RECEPCAO_STATUS_NA_CLINICA = [
  'CHECK_IN',
  'AGUARDANDO',
] as const satisfies readonly AgendamentoStatus[];

export function recepcaoPodeAlterar(status: AgendamentoStatus): boolean {
  return !(RECEPCAO_STATUS_TRAVADOS as readonly AgendamentoStatus[]).includes(status);
}

export function recepcaoStatusNaClinica(status: AgendamentoStatus): boolean {
  return (RECEPCAO_STATUS_NA_CLINICA as readonly AgendamentoStatus[]).includes(status);
}

/** Rótulos dos botões rápidos (o vocabulário do documento do cliente). */
export const RECEPCAO_STATUS_ROTULOS: Record<RecepcaoStatusAcao, string> = {
  CONFIRMADO: 'Confirmado',
  CHECK_IN: 'Chegou',
  AGUARDANDO: 'Aguardando',
  FALTOU: 'Faltou',
  CANCELADO: 'Cancelou',
  REAGENDAR: 'Reagendou',
};

/** Atualização automática da lista, em milissegundos (sem recarregar a página). */
export const RECEPCAO_ATUALIZACAO_MS = 15_000;

/** O grid mostra o dia inteiro numa página. */
export const RECEPCAO_PAGE_SIZE = 100;

export const RECEPCAO_SORT_FIELDS = ['inicio', 'paciente', 'profissional', 'sala'] as const;

/** `GET /api/comercial-atendimento/recepcao`: os atendimentos de hoje (dia da clínica). */
export const listRecepcaoQuerySchema = listQuerySchema({
  sortFields: RECEPCAO_SORT_FIELDS,
  defaultSort: 'inicio:asc',
  filters: {
    profissionalId: z.uuid({ error: 'Profissional inválido' }).optional(),
    salaId: z.uuid({ error: 'Sala inválida' }).optional(),
    status: agendamentoStatusSchema.optional(),
  },
});
export type ListRecepcaoQuery = z.infer<typeof listRecepcaoQuerySchema>;

/** Linha do grid e da fila: só o que a recepção precisa, sem dado clínico. */
export const recepcaoItemSchema = z.object({
  /** Id do agendamento. */
  id: z.uuid(),
  inicio: z.iso.datetime(),
  pacienteNome: z.string(),
  profissionalId: z.uuid(),
  profissionalNome: z.string(),
  salaNome: z.string().nullable(),
  status: agendamentoStatusSchema,
  /** Horário em que o paciente chegou (Chegou/Aguardando). */
  chegadaEm: z.iso.datetime().nullable(),
  /** Horário em que entrou no consultório (Atender). */
  entradaEm: z.iso.datetime().nullable(),
  /** Horário em que o atendimento terminou. */
  finalizadoEm: z.iso.datetime().nullable(),
});
export type RecepcaoItem = z.infer<typeof recepcaoItemSchema>;

export const recepcaoPageSchema = paginatedResponseSchema(recepcaoItemSchema);
export type RecepcaoPage = z.infer<typeof recepcaoPageSchema>;

/** `GET .../recepcao/fila`: quem está na clínica esperando, do que chegou há mais tempo. */
export const recepcaoFilaSchema = z.object({ data: z.array(recepcaoItemSchema) });
export type RecepcaoFila = z.infer<typeof recepcaoFilaSchema>;

/** `PATCH .../recepcao/:id/status`. */
export const updateRecepcaoStatusSchema = z.object({
  status: z.enum(RECEPCAO_STATUS_ACAO, { error: 'Status inválido' }),
});
export type UpdateRecepcaoStatusInput = z.infer<typeof updateRecepcaoStatusSchema>;
