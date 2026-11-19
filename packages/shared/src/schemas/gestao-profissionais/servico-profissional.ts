import { z } from 'zod';
import { ativoStatusSchema, listQuerySchema } from '../common/list-query';
import { erroObrigatorio, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const SERVICO_NOME_MAX = 150;
export const SERVICO_CATEGORIA_MAX = 60;
export const SERVICO_DESCRICAO_MAX = 1000;
export const SERVICO_DURACAO_MAX = 1440;
export const SERVICO_DURACAO_PADRAO = 30;
export const SERVICO_VALOR_MAX = 9_999_999.99;

const textoOpcional = (max: number, rotulo: string) =>
  z
    .string({ error: `${rotulo} inválida` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

/**
 * Corpo de `POST` e `PATCH /api/gestao-profissionais/servicos-profissionais` (modais "Novo
 * Serviço" e "Editar Serviço"). O `PATCH` substitui os campos do formulário.
 */
export const servicoProfissionalInputSchema = z.strictObject({
  profissionalId: z.uuid({ error: erroObrigatorio('Profissional') }),
  nome: textoObrigatorio('Nome do serviço', { max: SERVICO_NOME_MAX }),
  categoria: textoOpcional(SERVICO_CATEGORIA_MAX, 'Categoria'),
  valor: z
    .number({ error: 'Valor inválido' })
    .min(0, { error: 'O valor não pode ser negativo' })
    .max(SERVICO_VALOR_MAX, { error: 'Valor inválido' })
    .default(0),
  duracaoMinutos: z
    .number({ error: 'Informe a duração em minutos' })
    .int({ error: 'A duração deve ser um número inteiro de minutos' })
    .min(1, { error: 'A duração deve ser de pelo menos 1 minuto' })
    .max(SERVICO_DURACAO_MAX, {
      error: `A duração deve ser de no máximo ${SERVICO_DURACAO_MAX} minutos`,
    })
    .default(SERVICO_DURACAO_PADRAO),
  descricao: textoOpcional(SERVICO_DESCRICAO_MAX, 'Descrição'),
});

export type ServicoProfissionalFormulario = z.input<typeof servicoProfissionalInputSchema>;
export type CreateServicoProfissionalInput = z.output<typeof servicoProfissionalInputSchema>;
export type UpdateServicoProfissionalInput = CreateServicoProfissionalInput;
export const createServicoProfissionalSchema = servicoProfissionalInputSchema;
export const updateServicoProfissionalSchema = servicoProfissionalInputSchema;

/** `PATCH /api/gestao-profissionais/servicos-profissionais/:id/status`: Ativar / Desativar. */
export const servicoProfissionalStatusSchema = z.strictObject({
  ativo: z.boolean({ error: 'Informe se o serviço fica ativo' }),
});
export type ServicoProfissionalStatusInput = z.infer<typeof servicoProfissionalStatusSchema>;

export const SERVICO_PROFISSIONAL_SORT_FIELDS = ['nome', 'valor', 'duracaoMinutos'] as const;

/** `GET /api/gestao-profissionais/servicos-profissionais`: agrupada por profissional, depois pelo `sort`. */
export const listServicosProfissionaisQuerySchema = listQuerySchema({
  sortFields: SERVICO_PROFISSIONAL_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: {
    profissionalId: z.uuid({ error: 'Profissional inválido' }).optional(),
    status: ativoStatusSchema.optional(),
  },
});

export type ListServicosProfissionaisQuery = z.infer<typeof listServicosProfissionaisQuerySchema>;

export const servicoProfissionalSchema = z.object({
  id: z.uuid(),
  profissionalId: z.uuid(),
  profissionalNome: z.string(),
  nome: z.string(),
  categoria: z.string().nullable(),
  valor: z.number(),
  duracaoMinutos: z.number().int(),
  descricao: z.string().nullable(),
  ativo: z.boolean(),
  /** Vinculado a outro cadastro: não pode ser excluído, só desativado. */
  emUso: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ServicoProfissional = z.infer<typeof servicoProfissionalSchema>;

export const servicoProfissionalPageSchema = paginatedResponseSchema(servicoProfissionalSchema);
export type ServicoProfissionalPage = z.infer<typeof servicoProfissionalPageSchema>;
