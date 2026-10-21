import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';

export const ESPECIALIDADE_NOME_MAX = 100;

/** Corpo de `POST` e `PATCH /api/gestao-profissionais/especialidades` (modal "Gerenciar Especialidades"). */
export const especialidadeInputSchema = z.strictObject({
  nome: z
    .string({ error: 'Informe o nome da especialidade' })
    .trim()
    .min(1, { error: 'Informe o nome da especialidade' })
    .max(ESPECIALIDADE_NOME_MAX, {
      error: `O nome deve ter no máximo ${ESPECIALIDADE_NOME_MAX} caracteres`,
    }),
});

export type EspecialidadeInput = z.input<typeof especialidadeInputSchema>;
export type CreateEspecialidadeInput = z.output<typeof especialidadeInputSchema>;
export type UpdateEspecialidadeInput = CreateEspecialidadeInput;
export const createEspecialidadeSchema = especialidadeInputSchema;
export const updateEspecialidadeSchema = especialidadeInputSchema;

export const especialidadeSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Especialidade = z.infer<typeof especialidadeSchema>;

/** A lista do modal traz todas as especialidades (sem paginação visível). */
export const especialidadePageSchema = paginatedResponseSchema(especialidadeSchema);

export const ESPECIALIDADE_SORT_FIELDS = ['nome'] as const;

/** `GET /api/gestao-profissionais/especialidades`. */
export const listEspecialidadesQuerySchema = listQuerySchema({
  sortFields: ESPECIALIDADE_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: {},
});

export type ListEspecialidadesQuery = z.infer<typeof listEspecialidadesQuerySchema>;
