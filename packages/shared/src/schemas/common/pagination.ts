import { z } from 'zod';

export const PAGE_SIZE_DEFAULT = 10;
export const PAGE_SIZE_MAX = 100;

/** `page` e `pageSize` da query string de uma listagem (CLAUDE.md, seção 3). */
export const paginationQuerySchema = z.object({
  page: z.coerce
    .number({ error: 'Página inválida' })
    .int({ error: 'Página inválida' })
    .min(1, { error: 'Página deve ser maior ou igual a 1' })
    .default(1),
  pageSize: z.coerce
    .number({ error: 'Tamanho da página inválido' })
    .int({ error: 'Tamanho da página inválido' })
    .min(1, { error: 'Tamanho da página deve ser maior ou igual a 1' })
    .max(PAGE_SIZE_MAX, { error: `Tamanho da página deve ser no máximo ${PAGE_SIZE_MAX}` })
    .default(PAGE_SIZE_DEFAULT),
});

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

/** Resposta padrão de listagem: `{ data, meta }`. */
export function paginatedResponseSchema<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: paginationMetaSchema });
}
