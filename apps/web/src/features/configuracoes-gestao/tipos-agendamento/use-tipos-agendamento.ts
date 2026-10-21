import {
  tipoAgendamentoPageSchema,
  tipoAgendamentoSchema,
  type CreateTipoAgendamentoInput,
  type TipoAgendamento,
  type UpdateTipoAgendamentoInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_TIPOS_AGENDAMENTO = '/api/configuracoes-gestao/tipos-agendamento';

const CHAVE = ['tipos-agendamento'] as const;

/** A tela mostra todos os tipos em cards, sem paginação: busca a primeira página no tamanho máximo. */
export function useTiposAgendamento() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: ({ signal }) =>
      apiFetch(URL_TIPOS_AGENDAMENTO, {
        query: { page: 1, pageSize: 100, sort: 'nome:asc' },
        schema: tipoAgendamentoPageSchema,
        signal,
      }),
  });
}

function useMutationTipo<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<TipoAgendamento>,
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
  return apiFetch(`${URL_TIPOS_AGENDAMENTO}${path}`, {
    method,
    body,
    schema: tipoAgendamentoSchema,
  });
}

export function useCriarTipo() {
  return useMutationTipo((dados: CreateTipoAgendamentoInput) => chamar('', 'POST', dados), true);
}

export function useAlterarTipo(id: string) {
  return useMutationTipo(
    (dados: UpdateTipoAgendamentoInput) => chamar(`/${id}`, 'PATCH', dados),
    true,
  );
}

export function useExcluirTipo() {
  return useMutationTipo((id: string) => chamar(`/${id}`, 'DELETE'), false);
}
