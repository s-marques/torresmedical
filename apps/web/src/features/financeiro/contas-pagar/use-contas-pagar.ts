import {
  contaPagarBaixaSchema,
  contaPagarSchema,
  type BaixarContaPagarInput,
  type CreateContaPagarInput,
  type UpdateContaPagarInput,
} from '@torres/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { useMutationContaFinanceira } from '../contas-financeiras/use-mutation-conta';

export const URL_CONTAS_PAGAR = '/api/financeiro/contas-pagar';
export { URL_CONTAS_BANCARIAS, useContasBancarias } from '../contas-bancarias/use-contas-bancarias';

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_CONTAS_PAGAR}${path}`, { method, body, schema: contaPagarSchema });
}

export function useCriarContaPagar() {
  return useMutationContaFinanceira(
    URL_CONTAS_PAGAR,
    (dados: CreateContaPagarInput) => chamar('', 'POST', dados),
    {
      formulario: true,
      sucesso: 'Conta a pagar cadastrada.',
    },
  );
}

export function useEditarContaPagar(id: string) {
  return useMutationContaFinanceira(
    URL_CONTAS_PAGAR,
    (dados: UpdateContaPagarInput) => chamar(`/${id}`, 'PATCH', dados),
    {
      formulario: true,
      sucesso: 'Conta a pagar atualizada.',
    },
  );
}

export function useExcluirContaPagar() {
  return useMutationContaFinanceira(URL_CONTAS_PAGAR, (id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Conta a pagar excluída.',
  });
}

export function useBaixarContaPagar(id: string) {
  return useMutationContaFinanceira(
    URL_CONTAS_PAGAR,
    (dados: BaixarContaPagarInput) => chamar(`/${id}/baixar`, 'POST', dados),
    { formulario: true, sucesso: 'Pagamento registrado.' },
  );
}

export function useCancelarBaixaContaPagar() {
  return useMutationContaFinanceira(
    URL_CONTAS_PAGAR,
    (id: string) => chamar(`/${id}/cancelar-baixa`, 'POST'),
    {
      sucesso: 'Baixa cancelada.',
    },
  );
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
