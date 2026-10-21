import { z } from 'zod';
import { ativoStatusSchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';

export const TIPO_AGENDAMENTO_NOME_MAX = 120;
export const TIPO_AGENDAMENTO_DURACAO_MAX = 1440;
export const TIPO_AGENDAMENTO_DURACAO_PADRAO = 30;
export const TIPO_AGENDAMENTO_COR_PADRAO = '#3b82f6';

const nome = z
  .string({ error: 'Nome é obrigatório.' })
  .trim()
  .min(1, { error: 'Nome é obrigatório.' })
  .max(TIPO_AGENDAMENTO_NOME_MAX, {
    error: `O nome deve ter no máximo ${TIPO_AGENDAMENTO_NOME_MAX} caracteres`,
  });

const duracaoMinutos = z
  .number({ error: 'Informe a duração em minutos' })
  .int({ error: 'A duração deve ser um número inteiro de minutos' })
  .min(1, { error: 'A duração deve ser de pelo menos 1 minuto' })
  .max(TIPO_AGENDAMENTO_DURACAO_MAX, {
    error: `A duração deve ser de no máximo ${TIPO_AGENDAMENTO_DURACAO_MAX} minutos`,
  });

const cor = z.string({ error: 'Cor inválida' }).regex(/^#[0-9a-fA-F]{6}$/, {
  error: 'Cor inválida. Use o formato #RRGGBB',
});

const campos = {
  nome,
  duracaoMinutos,
  cor,
  permiteProcedimento: z.boolean({ error: 'Valor inválido' }),
  permitePacote: z.boolean({ error: 'Valor inválido' }),
  soroterapia: z.boolean({ error: 'Valor inválido' }),
};

/** `POST /api/configuracoes-gestao/tipos-agendamento`. Valores padrão do modal "Novo Tipo". */
export const createTipoAgendamentoSchema = z.strictObject({
  nome,
  duracaoMinutos: duracaoMinutos.default(TIPO_AGENDAMENTO_DURACAO_PADRAO),
  cor: cor.default(TIPO_AGENDAMENTO_COR_PADRAO),
  permiteProcedimento: campos.permiteProcedimento.default(false),
  permitePacote: campos.permitePacote.default(false),
  soroterapia: campos.soroterapia.default(false),
});

export type CreateTipoAgendamentoInput = z.infer<typeof createTipoAgendamentoSchema>;
export type TipoAgendamentoFormulario = z.input<typeof createTipoAgendamentoSchema>;

/** `PATCH /api/configuracoes-gestao/tipos-agendamento/:id`. */
export const updateTipoAgendamentoSchema = z
  .strictObject({
    nome: campos.nome.optional(),
    duracaoMinutos: campos.duracaoMinutos.optional(),
    cor: campos.cor.optional(),
    permiteProcedimento: campos.permiteProcedimento.optional(),
    permitePacote: campos.permitePacote.optional(),
    soroterapia: campos.soroterapia.optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'Informe ao menos um campo para alterar',
  });

export type UpdateTipoAgendamentoInput = z.infer<typeof updateTipoAgendamentoSchema>;

export const TIPO_AGENDAMENTO_SORT_FIELDS = ['nome', 'duracaoMinutos', 'createdAt'] as const;

/** `GET /api/configuracoes-gestao/tipos-agendamento`. */
export const listTiposAgendamentoQuerySchema = listQuerySchema({
  sortFields: TIPO_AGENDAMENTO_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: { status: ativoStatusSchema.optional() },
});

export type ListTiposAgendamentoQuery = z.infer<typeof listTiposAgendamentoQuerySchema>;

export const tipoAgendamentoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  duracaoMinutos: z.number().int(),
  cor: z.string().nullable(),
  permiteProcedimento: z.boolean(),
  permitePacote: z.boolean(),
  soroterapia: z.boolean(),
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type TipoAgendamento = z.infer<typeof tipoAgendamentoSchema>;

export const tipoAgendamentoPageSchema = paginatedResponseSchema(tipoAgendamentoSchema);

export type TipoAgendamentoPage = z.infer<typeof tipoAgendamentoPageSchema>;
