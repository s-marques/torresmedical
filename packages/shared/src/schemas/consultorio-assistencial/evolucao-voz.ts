import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { mensagemObrigatoria } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';
import {
  atendimentoMedicoItemSchema,
  EVOLUCAO_TEXTO_MAX,
  listAtendimentoMedicoQuerySchema,
} from './atendimento-medico';

/**
 * Tela Evolução por Voz (`/evolucoes`, #39): "Agendamentos de Hoje" e a sessão de gravação do
 * agendamento escolhido. A transcrição vira uma evolução "Evolução/Anotação" do atendimento,
 * a mesma que aparece no Atendimento Médico e no Prontuário (confirmado pelo dev).
 */

export const EVOLUCAO_VOZ_SORT_FIELDS = ['inicio', 'paciente'] as const;

/** A lista do dia não tem paginação na tela. */
export const EVOLUCAO_VOZ_PAGE_SIZE = 100;

/**
 * `GET /api/consultorio-assistencial/evolucao-voz`: agendamentos do dia, menos os cancelados.
 * `search` é o campo "Paciente" e `profissionalId` o select "Profissional" do "Buscar paciente".
 */
export const listEvolucaoVozQuerySchema = listQuerySchema({
  sortFields: EVOLUCAO_VOZ_SORT_FIELDS,
  defaultSort: 'inicio:asc',
  filters: {
    data: listAtendimentoMedicoQuerySchema.shape.data,
    profissionalId: z.uuid({ error: 'Profissional inválido' }).optional(),
  },
});
export type ListEvolucaoVozQuery = z.infer<typeof listEvolucaoVozQuerySchema>;

/** Linha da lista e cabeçalho da sessão ("Agendamento #1422"). */
export const evolucaoVozAgendamentoSchema = atendimentoMedicoItemSchema.extend({
  numero: z.number().int(),
});
export type EvolucaoVozAgendamento = z.infer<typeof evolucaoVozAgendamentoSchema>;

export const evolucaoVozAgendamentoPageSchema = paginatedResponseSchema(
  evolucaoVozAgendamentoSchema,
);
export type EvolucaoVozAgendamentoPage = z.infer<typeof evolucaoVozAgendamentoPageSchema>;

/** Corpo de `POST .../evolucao-voz/:agendamentoId/evolucoes` ("Salvar Evolução"). */
export const evolucaoVozInputSchema = z.strictObject({
  texto: z
    .string({ error: mensagemObrigatoria('Transcrição', 'f') })
    .trim()
    .min(1, { error: mensagemObrigatoria('Transcrição', 'f') })
    .max(EVOLUCAO_TEXTO_MAX, {
      error: `A transcrição deve ter no máximo ${EVOLUCAO_TEXTO_MAX} caracteres`,
    }),
});
export type EvolucaoVozFormulario = z.input<typeof evolucaoVozInputSchema>;
export type CreateEvolucaoVozInput = z.output<typeof evolucaoVozInputSchema>;
