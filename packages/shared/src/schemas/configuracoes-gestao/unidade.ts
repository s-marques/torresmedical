import { z } from 'zod';
import { ativoStatusSchema, exportQuerySchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';

export const UNIDADE_NOME_MAX = 120;

const nome = z
  .string({ error: (issue) => (issue.input === undefined ? 'Informe o nome' : 'Nome inválido') })
  .trim()
  .min(1, { error: 'Informe o nome' })
  .max(UNIDADE_NOME_MAX, { error: `O nome deve ter no máximo ${UNIDADE_NOME_MAX} caracteres` });

/** `POST /api/configuracoes-gestao/unidades`. O `empresaId` passa a vir do usuário logado após a Autenticação. */
export const createUnidadeSchema = z.strictObject({
  empresaId: z.uuid({
    error: (issue) => (issue.input === undefined ? 'Informe a empresa' : 'Empresa inválida'),
  }),
  nome,
  ativo: z.boolean().default(true),
});

export type CreateUnidadeInput = z.infer<typeof createUnidadeSchema>;

/** `PATCH /api/configuracoes-gestao/unidades/:id`. */
export const updateUnidadeSchema = z
  .strictObject({ nome: nome.optional(), ativo: z.boolean().optional() })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'Informe ao menos um campo para alterar',
  });

export type UpdateUnidadeInput = z.infer<typeof updateUnidadeSchema>;

export const UNIDADE_SORT_FIELDS = ['nome', 'ativo', 'createdAt'] as const;

/** `GET /api/configuracoes-gestao/unidades`. */
export const listUnidadesQuerySchema = listQuerySchema({
  sortFields: UNIDADE_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: {
    status: ativoStatusSchema.optional(),
    empresaId: z.uuid({ error: 'Empresa inválida' }).optional(),
  },
});

export type ListUnidadesQuery = z.infer<typeof listUnidadesQuerySchema>;

export const UNIDADE_EXPORT_COLUMNS = ['nome', 'status', 'createdAt'] as const;
export type UnidadeExportColumn = (typeof UNIDADE_EXPORT_COLUMNS)[number];

/** `GET /api/configuracoes-gestao/unidades/export`. */
export const exportUnidadesQuerySchema = exportQuerySchema(
  listUnidadesQuerySchema,
  UNIDADE_EXPORT_COLUMNS,
);

export type ExportUnidadesQuery = z.infer<typeof exportUnidadesQuerySchema>;

export const unidadeSchema = z.object({
  id: z.uuid(),
  empresaId: z.uuid(),
  nome: z.string(),
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Unidade = z.infer<typeof unidadeSchema>;

export const unidadePageSchema = paginatedResponseSchema(unidadeSchema);

export type UnidadePage = z.infer<typeof unidadePageSchema>;
