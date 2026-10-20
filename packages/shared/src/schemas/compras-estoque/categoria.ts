import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';
import { TIPOS_ITEM } from '../lookups/lookup';

export const CATEGORIA_NOME_MAX = 120;
export const CATEGORIA_DESCRICAO_MAX = 255;

/** Paleta do seletor de cor (bolinhas do modal). A primeira é a cor padrão. */
export const CATEGORIA_CORES = [
  '#6366f1',
  '#3b82f6',
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#a855f7',
  '#6b7280',
  '#14b8a6',
] as const;

export const CATEGORIA_COR_PADRAO = CATEGORIA_CORES[0];

const nome = z
  .string({ error: 'O nome da categoria é obrigatório.' })
  .trim()
  .min(1, { error: 'O nome da categoria é obrigatório.' })
  .max(CATEGORIA_NOME_MAX, {
    error: `O nome deve ter no máximo ${CATEGORIA_NOME_MAX} caracteres`,
  });

const tipo = z.enum(TIPOS_ITEM, { error: 'Tipo deve ser produto ou servico' });

/** Qualquer cor `#rrggbb`: categorias antigas têm cores fora da paleta e precisam continuar editáveis. */
const cor = z
  .string({ error: 'Cor inválida' })
  .regex(/^#[0-9a-fA-F]{6}$/, { error: 'Cor inválida' });

/** Descrição opcional: vazio vira `null`. */
const descricao = z
  .string()
  .trim()
  .max(CATEGORIA_DESCRICAO_MAX, {
    error: `A descrição deve ter no máximo ${CATEGORIA_DESCRICAO_MAX} caracteres`,
  })
  .nullish()
  .transform((valor) => valor || null);

/** `POST /api/compras-estoque/categorias`: modal "Nova Categoria". */
export const createCategoriaSchema = z.strictObject({
  nome,
  tipo: tipo.default('servico'),
  cor: cor.default(CATEGORIA_COR_PADRAO),
  descricao,
});

export type CreateCategoriaInput = z.infer<typeof createCategoriaSchema>;
export type CategoriaFormInput = z.input<typeof createCategoriaSchema>;

/** `PATCH /api/compras-estoque/categorias/:id`: modal "Editar Categoria" (mesmos campos). */
export const updateCategoriaSchema = createCategoriaSchema;

export type UpdateCategoriaInput = z.infer<typeof updateCategoriaSchema>;

export const CATEGORIA_SORT_FIELDS = ['nome', 'tipo', 'descricao'] as const;

/** `GET /api/compras-estoque/categorias`. O chip Todas/Produtos/Serviços é o filtro `tipo`. */
export const listCategoriasQuerySchema = listQuerySchema({
  sortFields: CATEGORIA_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: { tipo: tipo.optional() },
});

export type ListCategoriasQuery = z.infer<typeof listCategoriasQuerySchema>;

export const CATEGORIA_EXPORT_COLUMNS = ['nome', 'tipo', 'cor', 'descricao'] as const;
export type CategoriaExportColumn = (typeof CATEGORIA_EXPORT_COLUMNS)[number];

/** `GET /api/compras-estoque/categorias/export`. */
export const exportCategoriasQuerySchema = exportQuerySchema(
  listCategoriasQuerySchema,
  CATEGORIA_EXPORT_COLUMNS,
);

export type ExportCategoriasQuery = z.infer<typeof exportCategoriasQuerySchema>;

export const categoriaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  /** Valor do banco (igual ao `audit_log`); na entrada e nos filtros o tipo é `produto`/`servico`. */
  tipo: z.enum(['PRODUTO', 'SERVICO']),
  cor: z.string().nullable(),
  descricao: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Categoria = z.infer<typeof categoriaSchema>;

export const categoriaPageSchema = paginatedResponseSchema(categoriaSchema);

export type CategoriaPage = z.infer<typeof categoriaPageSchema>;
