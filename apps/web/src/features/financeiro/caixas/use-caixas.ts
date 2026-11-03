import { caixaSchema, type AbrirCaixaInput } from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_CAIXAS = '/api/financeiro/caixas';

/** Abrir Caixa: ao concluir, a listagem do `DataGrid` é buscada de novo. */
export function useAbrirCaixa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: AbrirCaixaInput) =>
      apiFetch(URL_CAIXAS, { method: 'POST', body: dados, schema: caixaSchema }),
    meta: META_FORMULARIO,
    onSuccess: async (caixa) => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_CAIXAS] });
      toast.success(`${caixa.nome} aberto!`);
    },
  });
}
