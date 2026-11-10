import { z } from 'zod';
import { cnpjValido } from '../comercial-atendimento/paciente';
import { ativoStatusSchema, exportQuerySchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';

export const UNIDADE_NOME_MAX = 120;
export const UNIDADE_ENDERECO_MAX = 200;
export const UNIDADE_CIDADE_MAX = 100;

/** Siglas do combobox UF do modal (as 27 unidades da federação). */
export const UNIDADE_UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

const nome = z
  .string({ error: (issue) => (issue.input === undefined ? 'Informe o nome' : 'Nome inválido') })
  .trim()
  .min(1, { error: 'Informe o nome' })
  .max(UNIDADE_NOME_MAX, { error: `O nome deve ter no máximo ${UNIDADE_NOME_MAX} caracteres` });

/** Texto opcional: vazio vira `null`. */
const textoOpcional = (max: number, rotulo: string) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

/** Campo só de dígitos (telefone, CNES…): aceita máscara e guarda só os dígitos. */
const digitosOpcional = (rotulo: string, tamanhos: readonly number[]) =>
  z
    .string({ error: `${rotulo} inválido` })
    .nullish()
    .transform((valor) => (valor ? valor.replaceAll(/\D/g, '') : null))
    .refine((valor) => valor === null || tamanhos.includes(valor.length), {
      error: `${rotulo} inválido`,
    });

/** Combobox UF: vazio ("Selecione") vira `null`. */
const uf = z
  .union([z.literal(''), z.enum(UNIDADE_UFS, { error: 'UF inválida' })])
  .nullish()
  .transform((valor) => valor || null);

const cnpj = z
  .string({ error: 'CNPJ inválido' })
  .nullish()
  .transform((valor) => (valor ? valor.replaceAll(/\D/g, '') : null))
  .refine((valor) => valor === null || cnpjValido(valor), { error: 'CNPJ inválido' });

/**
 * `POST`/`PATCH /api/configuracoes-gestao/unidades` (modal "Nova Unidade"/"Editar Unidade").
 * `empresaId` vem do usuário logado, nunca do corpo da requisição.
 */
export const unidadeInputSchema = z.strictObject({
  nome,
  endereco: textoOpcional(UNIDADE_ENDERECO_MAX, 'Endereço'),
  cidade: textoOpcional(UNIDADE_CIDADE_MAX, 'Cidade'),
  uf,
  telefone: digitosOpcional('Telefone', [10, 11]),
  cnpj,
  cnes: digitosOpcional('CNES', [7]),
  ativo: z.boolean().default(true),
});

export type UnidadeFormulario = z.input<typeof unidadeInputSchema>;
export type CreateUnidadeInput = z.output<typeof unidadeInputSchema>;
export const createUnidadeSchema = unidadeInputSchema;

/** `PATCH /api/configuracoes-gestao/unidades/:id`. */
export const updateUnidadeSchema = z
  .strictObject({
    nome: nome.optional(),
    endereco: unidadeInputSchema.shape.endereco.optional(),
    cidade: unidadeInputSchema.shape.cidade.optional(),
    uf: unidadeInputSchema.shape.uf.optional(),
    telefone: unidadeInputSchema.shape.telefone.optional(),
    cnpj: unidadeInputSchema.shape.cnpj.optional(),
    cnes: unidadeInputSchema.shape.cnes.optional(),
    ativo: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'Informe ao menos um campo para alterar',
  });

export type UpdateUnidadeInput = z.infer<typeof updateUnidadeSchema>;

export const UNIDADE_SORT_FIELDS = ['nome', 'ativo', 'createdAt'] as const;

/** `GET /api/configuracoes-gestao/unidades`. Sempre filtrada pela empresa do usuário logado. */
export const listUnidadesQuerySchema = listQuerySchema({
  sortFields: UNIDADE_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: {
    status: ativoStatusSchema.optional(),
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
  endereco: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  telefone: z.string().nullable(),
  cnpj: z.string().nullable(),
  cnes: z.string().nullable(),
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Unidade = z.infer<typeof unidadeSchema>;

export const unidadePageSchema = paginatedResponseSchema(unidadeSchema);

export type UnidadePage = z.infer<typeof unidadePageSchema>;
