import {
  recepcaoFilaSchema,
  recepcaoItemSchema,
  RECEPCAO_ATUALIZACAO_MS,
  type RecepcaoItem,
  type RecepcaoStatusAcao,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

export const URL_RECEPCAO = '/api/comercial-atendimento/recepcao';

const CHAVE_FILA = ['recepcao', 'fila'] as const;

/** Fila de espera (quem chegou e aguarda), atualizada sozinha. */
export function useFilaRecepcao() {
  return useQuery({
    queryKey: CHAVE_FILA,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_RECEPCAO}/fila`, { schema: recepcaoFilaSchema, signal }),
    refetchInterval: RECEPCAO_ATUALIZACAO_MS,
  });
}

/** Status rápido da linha: grava o horário da transição e refaz o grid e a fila. */
export function useAlterarStatusRecepcao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: RecepcaoStatusAcao;
    }): Promise<RecepcaoItem> =>
      apiFetch(`${URL_RECEPCAO}/${id}/status`, {
        method: 'PATCH',
        body: { status },
        schema: recepcaoItemSchema,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_RECEPCAO] }),
        queryClient.invalidateQueries({ queryKey: CHAVE_FILA }),
      ]);
    },
  });
}
