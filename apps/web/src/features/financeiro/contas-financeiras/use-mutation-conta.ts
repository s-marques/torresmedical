import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { META_FORMULARIO } from '@/lib/api/query-client';

/**
 * Mutations de Contas a Pagar e Contas a Receber: ao concluir, a listagem do `DataGrid` da `url`
 * é buscada de novo e, se houver, a mensagem de sucesso aparece em toast.
 */
export function useMutationContaFinanceira<TVariaveis>(
  url: string,
  mutationFn: (variaveis: TVariaveis) => Promise<unknown>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', url] });
      if (sucesso) toast.success(sucesso);
    },
  });
}
