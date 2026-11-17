import { loteSchema, resumoLotesSchema, type LoteInput } from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_LOTES = '/api/compras-estoque/lotes';

const CHAVE_LOTES = ['lotes'] as const;
/** Cards e alertas da tela Estoque também contam os lotes. */
const CHAVE_ESTOQUE = ['estoque'] as const;

/** Cards do topo. */
export function useResumoLotes() {
  return useQuery({
    queryKey: [...CHAVE_LOTES, 'resumo'],
    queryFn: ({ signal }) => apiFetch(`${URL_LOTES}/resumo`, { schema: resumoLotesSchema, signal }),
  });
}

/** "Novo Lote" → "Cadastrar": atualiza os cards, o grid e os alertas da tela Estoque. */
export function useCriarLote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: LoteInput) =>
      apiFetch(URL_LOTES, { method: 'POST', body: dados, schema: loteSchema }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CHAVE_LOTES }),
        queryClient.invalidateQueries({ queryKey: CHAVE_ESTOQUE }),
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_LOTES] }),
      ]);
      toast.success('Lote cadastrado.');
    },
  });
}
