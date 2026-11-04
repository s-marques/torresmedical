import {
  contaReceberSchema,
  type CreateContaReceberInput,
  type UpdateContaReceberInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_CONTAS_RECEBER = '/api/financeiro/contas-receber';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationContaReceber<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<unknown>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_CONTAS_RECEBER] });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_CONTAS_RECEBER}${path}`, { method, body, schema: contaReceberSchema });
}

export function useCriarContaReceber() {
  return useMutationContaReceber((dados: CreateContaReceberInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Conta a receber cadastrada.',
  });
}

export function useEditarContaReceber(id: string) {
  return useMutationContaReceber(
    (dados: UpdateContaReceberInput) => chamar(`/${id}`, 'PATCH', dados),
    { formulario: true, sucesso: 'Conta a receber atualizada.' },
  );
}

export function useExcluirContaReceber() {
  return useMutationContaReceber((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Conta a receber excluída.',
  });
}
