import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';
import { atendimentoMedicoItemSchema } from './atendimento-medico';

/**
 * Tela Soroterapia (`/soroterapia`, issue #44): "Checklists de infusao e soroterapia", com as abas
 * Fila do Dia, Pacotes, Em Andamento e Historico. O inventário só mostra a tela em leitura: o
 * fluxo do checklist (iniciar, sinais vitais, finalizar, suspender) não está documentado e fica
 * para uma próxima entrega, depois de confirmado com o dev.
 */

// --- Status do checklist -----------------------------------------------------------------

export const SOROTERAPIA_STATUS = ['EM_ANDAMENTO', 'FINALIZADO', 'SUSPENSO'] as const;
export const soroterapiaStatusSchema = z.enum(SOROTERAPIA_STATUS, { error: 'Status inválido' });
export type SoroterapiaStatus = (typeof SOROTERAPIA_STATUS)[number];

export const SOROTERAPIA_STATUS_ROTULOS: Readonly<Record<SoroterapiaStatus, string>> = {
  EM_ANDAMENTO: 'Em andamento',
  FINALIZADO: 'Finalizado',
  SUSPENSO: 'Suspenso',
};

/** Chips da aba Historico (inventário: Todos · Finalizado · Suspenso). */
export const SOROTERAPIA_STATUS_HISTORICO = ['FINALIZADO', 'SUSPENSO'] as const;
export const soroterapiaStatusHistoricoSchema = z.enum(SOROTERAPIA_STATUS_HISTORICO, {
  error: 'Status inválido',
});
export type SoroterapiaStatusHistorico = (typeof SOROTERAPIA_STATUS_HISTORICO)[number];

// --- Checklists (abas Em Andamento e Historico) -------------------------------------------

/** Colunas ordenáveis (inventário: Data, Paciente, Profissional, Protocolo e Status). */
export const SOROTERAPIA_SORT_FIELDS = [
  'data',
  'paciente',
  'profissional',
  'protocolo',
  'status',
] as const;
export type SoroterapiaSortField = (typeof SOROTERAPIA_SORT_FIELDS)[number];

/** `GET /api/consultorio-assistencial/soroterapia/em-andamento`. */
export const listSoroterapiaEmAndamentoQuerySchema = listQuerySchema({
  sortFields: SOROTERAPIA_SORT_FIELDS,
  defaultSort: 'data:desc',
  filters: {},
});
export type ListSoroterapiaEmAndamentoQuery = z.infer<typeof listSoroterapiaEmAndamentoQuerySchema>;

/** `GET /api/consultorio-assistencial/soroterapia/historico`: Finalizado ou Suspenso. */
export const listSoroterapiaHistoricoQuerySchema = listQuerySchema({
  sortFields: SOROTERAPIA_SORT_FIELDS,
  defaultSort: 'data:desc',
  filters: { status: soroterapiaStatusHistoricoSchema.optional() },
});
export type ListSoroterapiaHistoricoQuery = z.infer<typeof listSoroterapiaHistoricoQuerySchema>;

/** Colunas do grid, na ordem do inventário. */
export const SOROTERAPIA_EXPORT_COLUMNS = [
  'data',
  'paciente',
  'profissional',
  'protocolo',
  'sinaisVitaisInicio',
  'status',
  'duracao',
] as const;
export type SoroterapiaExportColumn = (typeof SOROTERAPIA_EXPORT_COLUMNS)[number];

export const exportSoroterapiaEmAndamentoQuerySchema = exportQuerySchema(
  listSoroterapiaEmAndamentoQuerySchema,
  SOROTERAPIA_EXPORT_COLUMNS,
);
export type ExportSoroterapiaEmAndamentoQuery = z.infer<
  typeof exportSoroterapiaEmAndamentoQuerySchema
>;

export const exportSoroterapiaHistoricoQuerySchema = exportQuerySchema(
  listSoroterapiaHistoricoQuerySchema,
  SOROTERAPIA_EXPORT_COLUMNS,
);
export type ExportSoroterapiaHistoricoQuery = z.infer<typeof exportSoroterapiaHistoricoQuerySchema>;

export const soroterapiaChecklistSchema = z.object({
  id: z.uuid(),
  /** Início do checklist (coluna "Data"). */
  data: z.iso.datetime(),
  pacienteId: z.uuid(),
  pacienteNome: z.string().nullable(),
  profissionalId: z.uuid(),
  profissionalNome: z.string().nullable(),
  /** Nome do protocolo, copiado no início do checklist. */
  protocolo: z.string(),
  sinaisVitaisInicio: z.string().nullable(),
  status: soroterapiaStatusSchema,
  /** Coluna "Duracao", em minutos: do início ao fim. Nulo enquanto em andamento. */
  duracaoMinutos: z.number().int().nullable(),
});
export type SoroterapiaChecklist = z.infer<typeof soroterapiaChecklistSchema>;

export const soroterapiaChecklistPageSchema = paginatedResponseSchema(soroterapiaChecklistSchema);
export type SoroterapiaChecklistPage = z.infer<typeof soroterapiaChecklistPageSchema>;

// --- Fila do Dia e Pacotes -----------------------------------------------------------------

/**
 * `GET /api/consultorio-assistencial/soroterapia/fila-dia`: agendamentos de hoje cujo tipo é
 * "É soroterapia (agenda separada)", menos os cancelados. Sem paginação (lista do dia).
 */
export const soroterapiaFilaDiaSchema = z.array(atendimentoMedicoItemSchema);
export type SoroterapiaFilaDia = z.infer<typeof soroterapiaFilaDiaSchema>;

/** Item de protocolo de um orçamento aprovado. */
export const soroterapiaPacoteSchema = z.object({
  id: z.uuid(),
  orcamentoId: z.uuid(),
  orcamentoNumero: z.number().int(),
  pacienteId: z.uuid().nullable(),
  pacienteNome: z.string().nullable(),
  protocolo: z.string(),
  quantidade: z.number().int(),
});
export type SoroterapiaPacote = z.infer<typeof soroterapiaPacoteSchema>;

/** `GET /api/consultorio-assistencial/soroterapia/pacotes`: protocolos de orçamentos Aprovados. */
export const soroterapiaPacotesSchema = z.array(soroterapiaPacoteSchema);
export type SoroterapiaPacotes = z.infer<typeof soroterapiaPacotesSchema>;
