import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  lookupItemSchema,
  lookupPageSchema,
  lookupPath,
  type LookupEntidade,
  type LookupItem,
  type LookupPage,
} from '@torres/shared';
import { apiFetch } from './client';

/** Itens por consulta do combobox. Acima disso, o usuário refina a busca. */
export const LOOKUP_PAGE_SIZE = 20;

/** Filtros extras do lookup (ex.: `{ tipo: 'servico' }`, `{ finalidade: 'receber' }`). */
export type FiltrosLookup = Readonly<Record<string, string | undefined>>;

export const lookupKeys = {
  lista: (entidade: LookupEntidade, search: string, filtros: FiltrosLookup = {}) =>
    ['lookups', entidade, 'lista', search, filtros] as const,
  item: (entidade: LookupEntidade, id: string) => ['lookups', entidade, 'item', id] as const,
};

/** `GET /api/lookups/<entidade>?search=&pageSize=&<filtros>`. */
export function buscarLookup(
  entidade: LookupEntidade,
  { search, filtros, signal }: { search?: string; filtros?: FiltrosLookup; signal?: AbortSignal },
): Promise<LookupPage> {
  return apiFetch(lookupPath(entidade), {
    query: { ...filtros, search: search || undefined, pageSize: LOOKUP_PAGE_SIZE },
    schema: lookupPageSchema,
    signal,
  });
}

/** `GET /api/lookups/<entidade>/:id`: o rótulo de um valor já gravado. */
export function buscarItemLookup(
  entidade: LookupEntidade,
  id: string,
  signal?: AbortSignal,
): Promise<LookupItem> {
  return apiFetch(`${lookupPath(entidade)}/${encodeURIComponent(id)}`, {
    schema: lookupItemSchema,
    signal,
  });
}

/** Opções do combobox para a busca atual. Só consulta com `ativo` (ex.: lista aberta). */
export function useLookup(
  entidade: LookupEntidade,
  search: string,
  { filtros, ativo = true }: { filtros?: FiltrosLookup; ativo?: boolean } = {},
) {
  return useQuery({
    queryKey: lookupKeys.lista(entidade, search, filtros),
    queryFn: ({ signal }) => buscarLookup(entidade, { search, filtros, signal }),
    enabled: ativo,
    placeholderData: keepPreviousData,
  });
}

/** Item pelo id, para exibir o valor selecionado. Sem id, não consulta. */
export function useItemLookup(entidade: LookupEntidade, id: string | null | undefined) {
  return useQuery({
    queryKey: lookupKeys.item(entidade, id ?? ''),
    queryFn: ({ signal }) => buscarItemLookup(entidade, id ?? '', signal),
    enabled: Boolean(id),
  });
}
