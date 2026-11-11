import {
  BUSCA_CONVERSAS_MIN,
  contadoresConversasWhatsappSchema,
  conversaWhatsappPageSchema,
  conversaWhatsappSchema,
  tagAtendimentoPageSchema,
  tagAtendimentoSchema,
  type ConversaWhatsappStatusFiltro,
  type CreateTagAtendimentoInput,
  type NovaConversaWhatsappInput,
} from '@torres/shared';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { useLookup } from '@/lib/api/lookups';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_CONVERSAS = '/api/comercial-atendimento/conversas-whatsapp';
export const URL_TAGS = '/api/comercial-atendimento/tags-atendimento';

/**
 * "Tempo real" por enquanto é consulta periódica (confirmado com o dev): a atualização por
 * push chega com a integração com o provedor.
 */
export const ATUALIZACAO_MS = 10_000;
/** Conversas por página da lista lateral; as seguintes carregam ao rolar até o fim. */
export const TAMANHO_PAGINA_CONVERSAS = 30;
/** Resultados do modal "Buscar Conversas". */
export const TAMANHO_PAGINA_BUSCA = 50;
/** Todas as tags cabem no modal "Gerenciar Tags". */
export const TAMANHO_PAGINA_TAGS = 100;

const RAIZ = ['whatsapp'] as const;

/** Chips "Canal": todos os canais cadastrados. */
export function useCanaisWhatsapp() {
  return useLookup('canais-whatsapp', '');
}

export function useConversas(
  filtros: { canalId?: string; status: ConversaWhatsappStatusFiltro },
  ativo = true,
) {
  return useInfiniteQuery({
    queryKey: [...RAIZ, 'conversas', filtros.canalId ?? null, filtros.status] as const,
    enabled: ativo,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      apiFetch(URL_CONVERSAS, {
        query: { ...filtros, page: pageParam, pageSize: TAMANHO_PAGINA_CONVERSAS },
        schema: conversaWhatsappPageSchema,
        signal,
      }),
    getNextPageParam: ({ meta }) => (meta.page < meta.totalPages ? meta.page + 1 : undefined),
    refetchInterval: ATUALIZACAO_MS,
  });
}

export function useContadores(canalId?: string) {
  return useQuery({
    queryKey: [...RAIZ, 'contadores', canalId ?? null] as const,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_CONVERSAS}/contadores`, {
        query: { canalId },
        schema: contadoresConversasWhatsappSchema,
        signal,
      }),
    refetchInterval: ATUALIZACAO_MS,
  });
}

/** Só consulta a partir de `BUSCA_CONVERSAS_MIN` caracteres. */
export function useBuscaConversas(search: string) {
  return useQuery({
    queryKey: [...RAIZ, 'busca', search] as const,
    enabled: search.length >= BUSCA_CONVERSAS_MIN,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(URL_CONVERSAS, {
        query: { search, pageSize: TAMANHO_PAGINA_BUSCA },
        schema: conversaWhatsappPageSchema,
        signal,
      }),
  });
}

export function useNovaConversa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: NovaConversaWhatsappInput) =>
      apiFetch(URL_CONVERSAS, { method: 'POST', body: dados, schema: conversaWhatsappSchema }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RAIZ });
      toast.success('Conversa iniciada.');
    },
  });
}

export function useTags(ativo: boolean) {
  return useQuery({
    queryKey: [...RAIZ, 'tags'] as const,
    enabled: ativo,
    queryFn: ({ signal }) =>
      apiFetch(URL_TAGS, {
        query: { pageSize: TAMANHO_PAGINA_TAGS },
        schema: tagAtendimentoPageSchema,
        signal,
      }),
  });
}

function useMutationTag<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<unknown>,
  formulario: boolean,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...RAIZ, 'tags'] }),
  });
}

export function useCriarTag() {
  return useMutationTag(
    (dados: CreateTagAtendimentoInput) =>
      apiFetch(URL_TAGS, { method: 'POST', body: dados, schema: tagAtendimentoSchema }),
    true,
  );
}

export function useExcluirTag() {
  return useMutationTag(
    (id: string) =>
      apiFetch(`${URL_TAGS}/${id}`, { method: 'DELETE', schema: tagAtendimentoSchema }),
    false,
  );
}
