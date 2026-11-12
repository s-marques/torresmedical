import {
  BUSCA_CONVERSAS_MIN,
  contadoresConversasWhatsappSchema,
  conversaWhatsappDetalheSchema,
  conversaWhatsappPageSchema,
  conversaWhatsappSchema,
  mensagemWhatsappPageSchema,
  mensagemWhatsappSchema,
  tagAtendimentoPageSchema,
  tagAtendimentoSchema,
  type ConversaWhatsappStatusFiltro,
  type CreateTagAtendimentoInput,
  type EnviarMensagemWhatsappInput,
  type NovaConversaWhatsappInput,
  type TransferirConversaWhatsappInput,
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
/** Mensagens por página do painel; as anteriores carregam sob demanda. */
export const TAMANHO_PAGINA_MENSAGENS = 30;
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

/** Cabeçalho e painel direito da conversa aberta. */
export function useConversa(id: string) {
  return useQuery({
    queryKey: [...RAIZ, 'conversa', id] as const,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_CONVERSAS}/${id}`, { schema: conversaWhatsappDetalheSchema, signal }),
    refetchInterval: ATUALIZACAO_MS,
  });
}

/** Mensagens da conversa. A API devolve as mais recentes primeiro; `mensagens` já vem na ordem da tela. */
export function useMensagens(id: string) {
  const consulta = useInfiniteQuery({
    queryKey: [...RAIZ, 'mensagens', id] as const,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      apiFetch(`${URL_CONVERSAS}/${id}/mensagens`, {
        query: { page: pageParam, pageSize: TAMANHO_PAGINA_MENSAGENS },
        schema: mensagemWhatsappPageSchema,
        signal,
      }),
    getNextPageParam: ({ meta }) => (meta.page < meta.totalPages ? meta.page + 1 : undefined),
    refetchInterval: ATUALIZACAO_MS,
  });
  const mensagens = (consulta.data?.pages ?? []).flatMap((pagina) => pagina.data).reverse();
  return { ...consulta, mensagens };
}

/** Mutations do painel: ao concluir, lista, contadores, cabeçalho e mensagens são buscados de novo. */
function useMutationConversa<TVariaveis, TResposta>(
  mutationFn: (variaveis: TVariaveis) => Promise<TResposta>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RAIZ });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function acao(id: string, caminho: string, body?: unknown) {
  return apiFetch(`${URL_CONVERSAS}/${id}/${caminho}`, {
    method: 'POST',
    body,
    schema: conversaWhatsappDetalheSchema,
  });
}

export function useEnviarMensagem(id: string) {
  return useMutationConversa(
    (dados: EnviarMensagemWhatsappInput) =>
      apiFetch(`${URL_CONVERSAS}/${id}/mensagens`, {
        method: 'POST',
        body: dados,
        schema: mensagemWhatsappSchema,
      }),
    { formulario: true },
  );
}

export function useAssumirConversa(id: string) {
  return useMutationConversa(() => acao(id, 'assumir'), { sucesso: 'Conversa assumida.' });
}

export function useEncerrarConversa(id: string) {
  return useMutationConversa(() => acao(id, 'encerrar'), { sucesso: 'Conversa encerrada.' });
}

export function useTransferirConversa(id: string) {
  return useMutationConversa(
    (dados: TransferirConversaWhatsappInput) => acao(id, 'transferir', dados),
    { formulario: true, sucesso: 'Conversa transferida.' },
  );
}

/** Aplica (`aplicar`) ou remove a tag da conversa. */
export function useAlterarTagDaConversa(id: string) {
  return useMutationConversa(({ tagId, aplicar }: { tagId: string; aplicar: boolean }) =>
    apiFetch(`${URL_CONVERSAS}/${id}/tags/${tagId}`, {
      method: aplicar ? 'PUT' : 'DELETE',
      schema: conversaWhatsappDetalheSchema,
    }),
  );
}
