import {
  contaReceberBaixaSchema,
  contaReceberSchema,
  type CancelarSemReagendamentoInput,
  type BaixarContaReceberInput,
  type CreateContaReceberInput,
  type RenegociarContaReceberInput,
  type UpdateContaReceberInput,
} from '@torres/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { i18next } from '@/lib/i18n';
import { useMutationContaFinanceira } from '../contas-financeiras/use-mutation-conta';

export const URL_CONTAS_RECEBER = '/api/financeiro/contas-receber';

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_CONTAS_RECEBER}${path}`, { method, body, schema: contaReceberSchema });
}

/** O histórico de baixas do detalhe depende da conta: mudou a conta, busca de novo. */
const INVALIDAR_BAIXAS = ['contas-receber'] as const;

export function useCriarContaReceber() {
  return useMutationContaFinanceira(
    URL_CONTAS_RECEBER,
    (dados: CreateContaReceberInput) => chamar('', 'POST', dados),
    {
      formulario: true,
      sucesso: 'Conta a receber cadastrada.',
    },
  );
}

export function useEditarContaReceber(id: string) {
  return useMutationContaFinanceira(
    URL_CONTAS_RECEBER,
    (dados: UpdateContaReceberInput) => chamar(`/${id}`, 'PATCH', dados),
    { formulario: true, sucesso: 'Conta a receber atualizada.', invalidar: INVALIDAR_BAIXAS },
  );
}

export function useExcluirContaReceber() {
  return useMutationContaFinanceira(
    URL_CONTAS_RECEBER,
    (id: string) => chamar(`/${id}`, 'DELETE'),
    {
      sucesso: 'Conta a receber excluída.',
    },
  );
}

/** Cancela a conta pendente com o motivo da lista (issue #162). */
export function useCancelarContaReceber(id: string) {
  return useMutationContaFinanceira(
    URL_CONTAS_RECEBER,
    (dados: CancelarSemReagendamentoInput) => chamar(`/${id}/cancelar`, 'POST', dados),
    { formulario: true, sucesso: i18next.t('cancelamento.contaReceber.sucesso') },
  );
}

/** Baixa (recebimento) total ou parcial: o saldo em aberto define se vira Parcial ou Pago. */
export function useBaixarContaReceber(id: string) {
  return useMutationContaFinanceira(
    URL_CONTAS_RECEBER,
    (dados: BaixarContaReceberInput) => chamar(`/${id}/baixar`, 'POST', dados),
    {
      formulario: true,
      sucesso: i18next.t('contasReceber.mensagens.baixaRegistrada'),
      invalidar: INVALIDAR_BAIXAS,
    },
  );
}

export function useCancelarBaixaContaReceber() {
  return useMutationContaFinanceira(
    URL_CONTAS_RECEBER,
    (id: string) => chamar(`/${id}/cancelar-baixa`, 'POST'),
    { sucesso: i18next.t('contasReceber.mensagens.baixaCancelada'), invalidar: INVALIDAR_BAIXAS },
  );
}

/** Renegociação: o original vira Renegociado e o saldo passa para os títulos novos. */
export function useRenegociarContaReceber(id: string) {
  return useMutationContaFinanceira(
    URL_CONTAS_RECEBER,
    (dados: RenegociarContaReceberInput) => chamar(`/${id}/renegociar`, 'POST', dados),
    {
      formulario: true,
      sucesso: i18next.t('contasReceber.mensagens.renegociada'),
      invalidar: INVALIDAR_BAIXAS,
    },
  );
}

/** Histórico de baixas da conta (modal de detalhe). */
export function useBaixasContaReceber(id: string | undefined) {
  return useQuery({
    queryKey: ['contas-receber', id, 'baixas'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_CONTAS_RECEBER}/${id}/baixas`, {
        schema: contaReceberBaixaSchema.array(),
        signal,
      }),
    enabled: Boolean(id),
  });
}
