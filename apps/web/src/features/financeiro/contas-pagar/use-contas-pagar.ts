import {
  contaBancariaListaSchema,
  contaPagarBaixaSchema,
  contaPagarSchema,
  type BaixarContaPagarInput,
  type CreateContaPagarInput,
  type UpdateContaPagarInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_CONTAS_PAGAR = '/api/financeiro/contas-pagar';
export const URL_CONTAS_BANCARIAS = '/api/financeiro/contas-bancarias';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationContaPagar<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<unknown>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_CONTAS_PAGAR] });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_CONTAS_PAGAR}${path}`, { method, body, schema: contaPagarSchema });
}

export function useCriarContaPagar() {
  return useMutationContaPagar((dados: CreateContaPagarInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Conta a pagar cadastrada.',
  });
}

export function useEditarContaPagar(id: string) {
  return useMutationContaPagar((dados: UpdateContaPagarInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'Conta a pagar atualizada.',
  });
}

export function useExcluirContaPagar() {
  return useMutationContaPagar((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Conta a pagar excluída.',
  });
}

export function useBaixarContaPagar(id: string) {
  return useMutationContaPagar(
    (dados: BaixarContaPagarInput) => chamar(`/${id}/baixar`, 'POST', dados),
    { formulario: true, sucesso: 'Pagamento registrado.' },
  );
}

export function useCancelarBaixaContaPagar() {
  return useMutationContaPagar((id: string) => chamar(`/${id}/cancelar-baixa`, 'POST'), {
    sucesso: 'Baixa cancelada.',
  });
}

/** Histórico de baixas da conta (modal de detalhe). */
export function useBaixasContaPagar(id: string | undefined) {
  return useQuery({
    queryKey: ['contas-pagar', id, 'baixas'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_CONTAS_PAGAR}/${id}/baixas`, {
        schema: contaPagarBaixaSchema.array(),
        signal,
      }),
    enabled: Boolean(id),
  });
}

/** Opções do combobox "Conta Bancária" da Baixa (lista inteira, sem paginação). */
export function useContasBancarias() {
  return useQuery({
    queryKey: ['contas-bancarias'],
    queryFn: ({ signal }) =>
      apiFetch(URL_CONTAS_BANCARIAS, { schema: contaBancariaListaSchema, signal }),
  });
}
