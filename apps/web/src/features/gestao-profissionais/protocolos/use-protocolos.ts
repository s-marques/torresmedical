import {
  protocoloCategoriasSchema,
  protocoloMaePageSchema,
  protocoloMaeSchema,
  protocoloPageSchema,
  protocoloSchema,
  type CreateProtocoloInput,
  type CreateProtocoloMaeInput,
  type Protocolo,
  type ProtocoloMae,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_PROTOCOLOS = '/api/gestao-profissionais/protocolos';
export const URL_PROTOCOLOS_MAE = '/api/gestao-profissionais/protocolos-mae';

const CHAVE = ['protocolos'] as const;
const CHAVE_MAE = ['protocolos-mae'] as const;

/** O limite da API por página; a tela agrupa por categoria e pagina só acima disso. */
export const TAMANHO_PAGINA = 100;

export interface FiltrosProtocolos {
  search: string;
  categoria: string | null;
  profissionalId: string | null;
  page: number;
}

export function useProtocolos({ search, categoria, profissionalId, page }: FiltrosProtocolos) {
  return useQuery({
    queryKey: [...CHAVE, 'lista', { search, categoria, profissionalId, page }],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(URL_PROTOCOLOS, {
        query: {
          page,
          pageSize: TAMANHO_PAGINA,
          sort: 'nome:asc',
          search: search || undefined,
          categoria: categoria ?? undefined,
          profissionalId: profissionalId ?? undefined,
        },
        schema: protocoloPageSchema,
        signal,
      }),
  });
}

/** Opções do filtro "Categoria". */
export function useCategoriasProtocolo() {
  return useQuery({
    queryKey: [...CHAVE, 'categorias'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PROTOCOLOS}/categorias`, { schema: protocoloCategoriasSchema, signal }),
  });
}

function useMutationProtocolo<TVariaveis, TResposta>(
  chaves: readonly (readonly string[])[],
  mutationFn: (variaveis: TVariaveis) => Promise<TResposta>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await Promise.all(chaves.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_PROTOCOLOS}${path}`, { method, body, schema: protocoloSchema });
}

// Protocolo mãe lista protocolos nas semanas: qualquer alteração invalida as duas listas.
const AMBAS = [CHAVE, CHAVE_MAE] as const;

export function useCriarProtocolo() {
  return useMutationProtocolo(AMBAS, (dados: CreateProtocoloInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Protocolo criado.',
  });
}

export function useAlterarProtocolo(id: string) {
  return useMutationProtocolo(
    AMBAS,
    (dados: CreateProtocoloInput) => chamar(`/${id}`, 'PATCH', dados),
    { formulario: true, sucesso: 'Protocolo atualizado.' },
  );
}

export function useDuplicarProtocolo() {
  return useMutationProtocolo(AMBAS, (id: string) => chamar(`/${id}/duplicar`, 'POST'), {
    sucesso: 'Protocolo duplicado.',
  });
}

export function useExcluirProtocolo() {
  return useMutationProtocolo(AMBAS, (id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Protocolo excluído.',
  });
}

export function useProtocolosMae(page: number) {
  return useQuery({
    queryKey: [...CHAVE_MAE, 'lista', { page }],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(URL_PROTOCOLOS_MAE, {
        query: { page, pageSize: TAMANHO_PAGINA, sort: 'nome:asc' },
        schema: protocoloMaePageSchema,
        signal,
      }),
  });
}

function chamarMae(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_PROTOCOLOS_MAE}${path}`, { method, body, schema: protocoloMaeSchema });
}

export function useCriarProtocoloMae() {
  return useMutationProtocolo(
    [CHAVE_MAE],
    (dados: CreateProtocoloMaeInput) => chamarMae('', 'POST', dados),
    { formulario: true, sucesso: 'Protocolo mãe criado.' },
  );
}

export function useAlterarProtocoloMae(id: string) {
  return useMutationProtocolo(
    [CHAVE_MAE],
    (dados: CreateProtocoloMaeInput) => chamarMae(`/${id}`, 'PATCH', dados),
    { formulario: true, sucesso: 'Protocolo mãe atualizado.' },
  );
}

export function useExcluirProtocoloMae() {
  return useMutationProtocolo([CHAVE_MAE], (id: string) => chamarMae(`/${id}`, 'DELETE'), {
    sucesso: 'Protocolo mãe excluído.',
  });
}

export type { Protocolo, ProtocoloMae };
