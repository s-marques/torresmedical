import type { PaginationMeta, Sort, SortDirection } from '@torres/shared';

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Page<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PageQueries<T> {
  /** Busca a página; repasse `skip`/`take` ao `findMany`. */
  findMany: (args: { skip: number; take: number }) => Promise<T[]>;
  /** Conta o total com o mesmo `where`. */
  count: () => Promise<number>;
}

/**
 * Executa a listagem paginada e monta `{ data, meta }` (CLAUDE.md, seção 3).
 * Ex.: `paginate(query, { findMany: (p) => tx.unidade.findMany({ where, orderBy, ...p }), count: () => tx.unidade.count({ where }) })`.
 */
export async function paginate<T>(request: PageRequest, queries: PageQueries<T>): Promise<Page<T>> {
  const [data, total] = await Promise.all([
    queries.findMany({ skip: (request.page - 1) * request.pageSize, take: request.pageSize }),
    queries.count(),
  ]);
  return {
    data,
    meta: {
      page: request.page,
      pageSize: request.pageSize,
      total,
      totalPages: Math.ceil(total / request.pageSize),
    },
  };
}

export type OrderBy<K extends string> = { [P in K]?: SortDirection };

/**
 * `orderBy` do Prisma a partir do `sort` validado, sempre desempatando por `id`
 * para a paginação ser estável. `fieldMap` traduz campos do grid para colunas (ex.: `status` → `ativo`).
 */
export function toOrderBy<F extends string, C extends string = F>(
  sort: Sort<F>,
  fieldMap: { [P in F]?: C } = {},
): OrderBy<C | 'id'>[] {
  const column: string = fieldMap[sort.field] ?? sort.field;
  const orderBy: OrderBy<C | 'id'>[] = [{ [column]: sort.direction } as OrderBy<C | 'id'>];
  if (column !== 'id') orderBy.push({ id: sort.direction } as OrderBy<C | 'id'>);
  return orderBy;
}

type ContainsFilter = { contains: string; mode: 'insensitive' };

/** `where` de busca textual (contém, sem diferenciar maiúsculas) em qualquer dos campos. */
export function searchWhere<F extends string>(
  search: string | undefined,
  fields: readonly F[],
): { OR: Array<Partial<Record<F, ContainsFilter>>> } | undefined {
  if (!search) return undefined;
  return {
    OR: fields.map(
      (field) =>
        ({ [field]: { contains: search, mode: 'insensitive' } }) as Partial<
          Record<F, ContainsFilter>
        >,
    ),
  };
}
