import { z } from 'zod';
import { paginationQuerySchema } from './pagination';

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export interface Sort<F extends string = string> {
  field: F;
  direction: SortDirection;
}

export const SEARCH_MAX_LENGTH = 200;

/** `sort=campo:asc|desc`, aceitando só os campos da whitelist do recurso. */
export function sortSchema<F extends string>(
  fields: readonly [F, ...F[]],
  defaultSort: `${F}:${SortDirection}`,
) {
  return z
    .string()
    .trim()
    .default(defaultSort)
    .transform((value, ctx): Sort<F> => {
      const [field = '', direction = 'asc', ...rest] = value.split(':');
      const valid =
        rest.length === 0 &&
        (fields as readonly string[]).includes(field) &&
        (SORT_DIRECTIONS as readonly string[]).includes(direction);
      if (!valid) {
        ctx.addIssue({
          code: 'custom',
          message: `Ordenação inválida. Use campo:asc ou campo:desc, com campo entre: ${fields.join(', ')}`,
        });
        return z.NEVER;
      }
      return { field: field as F, direction: direction as SortDirection };
    });
}

/** Busca textual: vazio vira ausente. */
export const searchSchema = z
  .string()
  .trim()
  .max(SEARCH_MAX_LENGTH)
  .optional()
  .transform((value) => value || undefined);

/** Chips de status mais comuns no inventário: Todos (ausente) / Ativo / Inativo. */
export const ATIVO_STATUS = ['ativo', 'inativo'] as const;
export const ativoStatusSchema = z.enum(ATIVO_STATUS);
export type AtivoStatus = z.infer<typeof ativoStatusSchema>;

export interface ListQueryOptions<F extends string, E extends z.ZodRawShape> {
  sortFields: readonly [F, ...F[]];
  defaultSort: `${F}:${SortDirection}`;
  /** Filtros específicos do recurso (ex.: `status`, `empresaId`, período). */
  filters: E;
}

/**
 * Query string padrão de listagem (CLAUDE.md, seção 3):
 * `?page=1&pageSize=10&sort=campo:asc&search=texto&<filtros>`.
 */
export function listQuerySchema<F extends string, E extends z.ZodRawShape>(
  options: ListQueryOptions<F, E>,
) {
  return paginationQuerySchema
    .extend({ sort: sortSchema(options.sortFields, options.defaultSort), search: searchSchema })
    .extend(options.filters);
}

const PAGINATION_KEYS: ReadonlySet<string> = new Set(['page', 'pageSize']);

export const EXPORT_FORMATS = ['xlsx', 'pdf', 'csv'] as const;
export const exportFormatSchema = z.enum(EXPORT_FORMATS, {
  error: 'Formato deve ser xlsx, pdf ou csv',
});
export type ExportFormat = z.infer<typeof exportFormatSchema>;

/** `columns=a,b,c`: colunas visíveis do grid, dentre as exportáveis do recurso. Padrão: todas. */
export function exportColumnsSchema<C extends string>(columns: readonly [C, ...C[]]) {
  return z
    .string()
    .optional()
    .transform((value, ctx): C[] => {
      const requested = (value ?? '')
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean);
      if (requested.length === 0) return [...columns];
      const invalid = requested.filter(
        (column) => !(columns as readonly string[]).includes(column),
      );
      if (invalid.length > 0) {
        ctx.addIssue({
          code: 'custom',
          message: `Colunas inválidas: ${invalid.join(', ')}. Disponíveis: ${columns.join(', ')}`,
        });
        return z.NEVER;
      }
      return [...new Set(requested)] as C[];
    });
}

/**
 * Query da exportação: os mesmos filtros e ordenação da listagem (sem paginação),
 * mais `format` e `columns`.
 */
export function exportQuerySchema<Shape extends z.ZodRawShape, C extends string>(
  listSchema: z.ZodObject<Shape>,
  columns: readonly [C, ...C[]],
) {
  const filters = Object.fromEntries(
    Object.entries(listSchema.shape).filter(([key]) => !PAGINATION_KEYS.has(key)),
  ) as Omit<Shape, 'page' | 'pageSize'>;
  return z.object({
    ...filters,
    format: exportFormatSchema,
    columns: exportColumnsSchema(columns),
  });
}
