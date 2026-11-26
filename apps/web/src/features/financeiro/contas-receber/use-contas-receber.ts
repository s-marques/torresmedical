import {
  contaReceberSchema,
  type CancelarSemReagendamentoInput,
  type CreateContaReceberInput,
  type UpdateContaReceberInput,
} from '@torres/shared';
import { apiFetch } from '@/lib/api/client';
import { i18next } from '@/lib/i18n';
import { useMutationContaFinanceira } from '../contas-financeiras/use-mutation-conta';

export const URL_CONTAS_RECEBER = '/api/financeiro/contas-receber';

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_CONTAS_RECEBER}${path}`, { method, body, schema: contaReceberSchema });
}

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
    { formulario: true, sucesso: 'Conta a receber atualizada.' },
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
