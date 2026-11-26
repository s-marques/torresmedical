import { z } from 'zod';
import { exportQuerySchema, listQuerySchema, searchSchema } from '../common/list-query';
import { erroObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';
import {
  contaReceberFiltroStatusSchema,
  contaReceberCamposSchema,
  contaReceberSchema,
} from '../financeiro/conta-receber';
import { decimal, filtrosContaFinanceira } from '../financeiro/conta-financeira';

/**
 * Receita Profissionais (`/receita-profissionais`): o que cada profissional recebeu dos seus
 * pacientes. São contas a receber com `profissionalId`, que ficam fora de Contas a Receber,
 * Conciliação e saldos do Torres ("sem misturar o caixa dos médicos", requisitos do cliente).
 */

export const RECEITA_PROFISSIONAL_SORT_FIELDS = [
  'dataVencimento',
  'profissional',
  'paciente',
  'valor',
] as const;

/** Filtros do grid: Profissional, Status, Forma de Pagamento e período De/Até. */
const filtrosReceitaProfissional = {
  ...filtrosContaFinanceira(contaReceberFiltroStatusSchema),
  profissionalId: z.uuid({ error: 'Profissional inválido' }).optional(),
  formaPagamentoId: z.uuid({ error: 'Forma de pagamento inválida' }).optional(),
};

/** `GET /api/gestao-profissionais/receita-profissionais`. */
export const listReceitaProfissionaisQuerySchema = listQuerySchema({
  sortFields: RECEITA_PROFISSIONAL_SORT_FIELDS,
  defaultSort: 'dataVencimento:desc',
  filters: filtrosReceitaProfissional,
});
export type ListReceitaProfissionaisQuery = z.infer<typeof listReceitaProfissionaisQuerySchema>;

/** `GET /api/gestao-profissionais/receita-profissionais/resumo`: os mesmos filtros, sem página. */
export const resumoReceitaProfissionaisQuerySchema = z.object({
  search: searchSchema,
  ...filtrosReceitaProfissional,
});
export type ResumoReceitaProfissionaisQuery = z.infer<typeof resumoReceitaProfissionaisQuerySchema>;

export const RECEITA_PROFISSIONAL_EXPORT_COLUMNS = [
  'dataVencimento',
  'profissional',
  'paciente',
  'descricao',
  'formaPagamento',
  'valor',
  'status',
] as const;
export type ReceitaProfissionalExportColumn = (typeof RECEITA_PROFISSIONAL_EXPORT_COLUMNS)[number];

/** `GET /api/gestao-profissionais/receita-profissionais/export`. */
export const exportReceitaProfissionaisQuerySchema = exportQuerySchema(
  listReceitaProfissionaisQuerySchema,
  RECEITA_PROFISSIONAL_EXPORT_COLUMNS,
);
export type ExportReceitaProfissionaisQuery = z.infer<typeof exportReceitaProfissionaisQuerySchema>;

/**
 * `PATCH /api/gestao-profissionais/receita-profissionais/:id` (ação "Editar"): os campos do
 * formulário de Contas a Receber mais o Profissional, obrigatório (a receita é do profissional).
 */
export const updateReceitaProfissionalSchema = contaReceberCamposSchema
  .omit({ profissionalSacadoId: true, competencia: true })
  .extend({
    profissionalId: z.uuid({ error: erroObrigatorio('Profissional') }),
  });
export type UpdateReceitaProfissionalInput = z.output<typeof updateReceitaProfissionalSchema>;
export type ReceitaProfissionalFormulario = z.input<typeof updateReceitaProfissionalSchema>;

export const receitaProfissionalSchema = contaReceberSchema.extend({
  profissionalId: z.uuid(),
  profissionalNome: z.string(),
});
export type ReceitaProfissional = z.infer<typeof receitaProfissionalSchema>;

export const receitaProfissionalPageSchema = paginatedResponseSchema(receitaProfissionalSchema);
export type ReceitaProfissionalPage = z.infer<typeof receitaProfissionalPageSchema>;

/** Card do "Resumo por Profissional": quanto cada um recebeu e em quantos registros. */
export const resumoProfissionalSchema = z.object({
  profissionalId: z.uuid(),
  profissionalNome: z.string(),
  totalRecebido: decimal,
  registros: z.number().int(),
});
export type ResumoProfissional = z.infer<typeof resumoProfissionalSchema>;

/**
 * Cards "Total Recebido", "Total Pendente" e "Registros" e o resumo por profissional. Somam todas
 * as páginas da consulta filtrada; contas canceladas ficam de fora.
 */
export const resumoReceitaProfissionaisSchema = z.object({
  totalRecebido: decimal,
  totalPendente: decimal,
  registros: z.number().int(),
  porProfissional: z.array(resumoProfissionalSchema),
});
export type ResumoReceitaProfissionais = z.infer<typeof resumoReceitaProfissionaisSchema>;
