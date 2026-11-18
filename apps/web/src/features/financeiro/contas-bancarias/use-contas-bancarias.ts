import {
  contaBancariaListaSchema,
  contaBancariaSchema,
  type CreateContaBancariaInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_CONTAS_BANCARIAS = '/api/financeiro/contas-bancarias';
const CHAVE = ['contas-bancarias'] as const;

/**
 * Contas bancárias ativas, com o saldo (lista inteira, sem paginação). Usada na aba "Contas
 * Bancárias" da Conciliação e nos comboboxes "Conta Bancária" de Contas a Pagar e a Receber.
 */
export function useContasBancarias() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: ({ signal }) =>
      apiFetch(URL_CONTAS_BANCARIAS, { schema: contaBancariaListaSchema, signal }),
  });
}

/** Opções dos comboboxes "Conta Bancária". */
export function useOpcoesContasBancarias() {
  const contas = useContasBancarias();
  return (contas.data?.data ?? []).map((c) => ({ valor: c.id, rotulo: c.nome }));
}

function useMutacaoContaBancaria<T>(
  mutationFn: (v: T) => Promise<unknown>,
  sucesso: string,
  formulario = false,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE });
      toast.success(sucesso);
    },
  });
}

/** Modal "Nova Conta". */
export function useCriarContaBancaria() {
  return useMutacaoContaBancaria(
    (dados: CreateContaBancariaInput) =>
      apiFetch(URL_CONTAS_BANCARIAS, { method: 'POST', body: dados, schema: contaBancariaSchema }),
    'Conta bancária cadastrada.',
    true,
  );
}

/** Lixeira do card. */
export function useExcluirContaBancaria() {
  return useMutacaoContaBancaria(
    (id: string) =>
      apiFetch(`${URL_CONTAS_BANCARIAS}/${id}`, { method: 'DELETE', schema: contaBancariaSchema }),
    'Conta bancária excluída.',
  );
}
