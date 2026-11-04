import {
  respostaRapidaPageSchema,
  respostaRapidaSchema,
  type CreateRespostaRapidaInput,
  type RespostaRapida,
  type UpdateRespostaRapidaInput,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_RESPOSTAS_RAPIDAS = '/api/configuracoes-gestao/respostas-rapidas';

const CHAVE = ['respostas-rapidas'] as const;

/**
 * A tela mostra as respostas em cards, sem paginação (como no sistema atual): busca a primeira
 * página no tamanho máximo, filtrada pela busca.
 */
export function useRespostasRapidas(search: string) {
  return useQuery({
    queryKey: [...CHAVE, search],
    queryFn: ({ signal }) =>
      apiFetch(URL_RESPOSTAS_RAPIDAS, {
        query: { page: 1, pageSize: 100, sort: 'titulo:asc', search: search || undefined },
        schema: respostaRapidaPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

function useMutationResposta<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<RespostaRapida>,
  formulario: boolean,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_RESPOSTAS_RAPIDAS}${path}`, {
    method,
    body,
    schema: respostaRapidaSchema,
  });
}

export function useCriarResposta() {
  return useMutationResposta((dados: CreateRespostaRapidaInput) => chamar('', 'POST', dados), true);
}

export function useAlterarResposta(id: string) {
  return useMutationResposta(
    (dados: UpdateRespostaRapidaInput) => chamar(`/${id}`, 'PATCH', dados),
    true,
  );
}

export function useExcluirResposta() {
  return useMutationResposta((id: string) => chamar(`/${id}`, 'DELETE'), false);
}
