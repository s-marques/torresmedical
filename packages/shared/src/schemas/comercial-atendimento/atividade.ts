import { z } from 'zod';
import { exportQuerySchema, listQuerySchema, searchSchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';
import { mensagemObrigatoria } from '../common/obrigatorio';
import {
  ATIVIDADE_STATUS,
  ATIVIDADE_TIPOS,
  NEGOCIO_STATUS,
  atividadeNegocioSchema,
  camposAgendamentoAtividade,
  uuidOpcional,
} from './negocio';

/**
 * Atividades do CRM (tela Atividades, `/atividades`): tarefas, ligações e follow-ups, ligadas ou
 * não a um negócio. São as mesmas atividades agendadas no Pipeline ("Agendar Follow-up").
 */

export const ATIVIDADE_DESCRICAO_MAX = 2000;

/**
 * `POST /atividades` e `PATCH /atividades/:id`: modal "Nova Atividade". Título, data e hora são
 * obrigatórios (próxima ação + data, requisito do cliente); o negócio é opcional, como no
 * sistema atual. Sem responsável, a atividade herda o do negócio.
 */
export const atividadeInputSchema = z.strictObject({
  ...camposAgendamentoAtividade,
  tipo: z.enum(ATIVIDADE_TIPOS, { error: mensagemObrigatoria('Tipo') }).default('TAREFA'),
  negocioId: uuidOpcional('Negócio inválido'),
  descricao: z
    .string()
    .trim()
    .max(ATIVIDADE_DESCRICAO_MAX, {
      error: `A descrição deve ter no máximo ${ATIVIDADE_DESCRICAO_MAX} caracteres`,
    })
    .nullish()
    .transform((valor) => valor || null),
});
export type AtividadeInput = z.output<typeof atividadeInputSchema>;
export type AtividadeFormulario = z.input<typeof atividadeInputSchema>;

/** Linha do grid: a atividade com o título e o status do negócio. */
export const atividadeSchema = atividadeNegocioSchema.extend({
  /** Título do negócio. */
  negocio: z.string().nullable(),
  negocioStatus: z.enum(NEGOCIO_STATUS).nullable(),
  concluidaEm: z.iso.datetime().nullable(),
  canceladaEm: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type Atividade = z.infer<typeof atividadeSchema>;

export const atividadePageSchema = paginatedResponseSchema(atividadeSchema);
export type AtividadePage = z.infer<typeof atividadePageSchema>;

export const ATIVIDADE_SORT_FIELDS = [
  'titulo',
  'tipo',
  'negocio',
  'dataHora',
  'status',
  'responsavel',
] as const;

const filtroTipo = z.enum(ATIVIDADE_TIPOS, { error: 'Tipo inválido' }).optional();

/** `GET /atividades`: busca, Tipo e Status (os dois combos "Todos" do inventário). */
export const listAtividadesQuerySchema = listQuerySchema({
  sortFields: ATIVIDADE_SORT_FIELDS,
  defaultSort: 'dataHora:asc',
  filters: {
    tipo: filtroTipo,
    status: z.enum(ATIVIDADE_STATUS, { error: 'Status inválido' }).optional(),
  },
});
export type ListAtividadesQuery = z.infer<typeof listAtividadesQuerySchema>;

/** Cartões Total/Pendentes/Concluídas/Canceladas: seguem a busca e o tipo, não o status. */
export const resumoAtividadesQuerySchema = z.object({
  search: searchSchema,
  tipo: filtroTipo,
});
export type ResumoAtividadesQuery = z.infer<typeof resumoAtividadesQuerySchema>;

export const resumoAtividadesSchema = z.object({
  total: z.number().int(),
  pendentes: z.number().int(),
  concluidas: z.number().int(),
  canceladas: z.number().int(),
});
export type ResumoAtividades = z.infer<typeof resumoAtividadesSchema>;

export const ATIVIDADE_EXPORT_COLUMNS = [
  'titulo',
  'tipo',
  'negocio',
  'dataHora',
  'status',
  'responsavel',
  'descricao',
] as const;
export type AtividadeExportColumn = (typeof ATIVIDADE_EXPORT_COLUMNS)[number];

/** `GET /atividades/export`. */
export const exportAtividadesQuerySchema = exportQuerySchema(
  listAtividadesQuerySchema,
  ATIVIDADE_EXPORT_COLUMNS,
);
export type ExportAtividadesQuery = z.infer<typeof exportAtividadesQuerySchema>;

/**
 * `GET /atividades/leads-sem-follow-up`: negócios abertos sem próxima ação futura (sem
 * atividade pendente ou com a próxima atrasada). Lista para o painel e a central do dia.
 */
export const leadsSemFollowUpQuerySchema = listQuerySchema({
  sortFields: ['titulo', 'createdAt'],
  defaultSort: 'createdAt:asc',
  filters: {
    responsavelId: z.uuid({ error: 'Responsável inválido' }).optional(),
  },
});
export type LeadsSemFollowUpQuery = z.infer<typeof leadsSemFollowUpQuerySchema>;
