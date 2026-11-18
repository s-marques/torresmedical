import { baixaInsumoSchema, type BaixaInsumoInput } from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_BAIXAS_INSUMOS = '/api/compras-estoque/baixas-insumos';

/** "Registrar Baixa": atualiza o grid e os saldos/movimentações da tela Estoque. */
export function useRegistrarBaixaInsumo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: BaixaInsumoInput) =>
      apiFetch(URL_BAIXAS_INSUMOS, { method: 'POST', body: dados, schema: baixaInsumoSchema }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_BAIXAS_INSUMOS] }),
        queryClient.invalidateQueries({ queryKey: ['estoque'] }),
        queryClient.invalidateQueries({ queryKey: ['lotes'] }),
      ]);
      toast.success('Baixa registrada.');
    },
  });
}
