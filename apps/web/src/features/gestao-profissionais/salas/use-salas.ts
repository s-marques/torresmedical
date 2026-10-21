import {
  salaPageSchema,
  salaSchema,
  type CreateSalaInput,
  type Sala,
  type UpdateSalaInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_SALAS = '/api/gestao-profissionais/salas';

const CHAVE = ['salas'] as const;

/** Os cards mostram todas as salas de uma vez; este é o limite da API por página. */
export const TAMANHO_PAGINA = 100;

export function useSalas() {
  return useQuery({
    queryKey: CHAVE,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(URL_SALAS, {
        query: { page: 1, pageSize: TAMANHO_PAGINA, sort: 'nome:asc' },
        schema: salaPageSchema,
        signal,
      }),
  });
}

function useMutationSala<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<Sala>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_SALAS}${path}`, { method, body, schema: salaSchema });
}

export function useCriarSala() {
  return useMutationSala((dados: CreateSalaInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Sala criada.',
  });
}

export function useAlterarSala(id: string) {
  return useMutationSala((dados: UpdateSalaInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'Sala atualizada.',
  });
}

export function useExcluirSala() {
  return useMutationSala((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Sala excluída.',
  });
}
