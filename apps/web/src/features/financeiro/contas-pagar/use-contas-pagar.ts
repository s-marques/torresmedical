import {
  contaPagarBaixaSchema,
  contaPagarSchema,
  verificacaoDuplicidadeContaPagarSchema,
  type BaixarContaPagarInput,
  type CancelarSemReagendamentoInput,
  type ContaPagarPossivelDuplicada,
  type CreateContaPagarInput,
  type RecusarContaPagarInput,
  type UpdateContaPagarInput,
  type VerificarDuplicidadeContaPagarInput,
} from '@torres/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { i18next } from '@/lib/i18n';
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

/** Cancela a conta pendente e sem baixa, com o motivo da lista (issue #162). */
export function useCancelarContaPagar(id: string) {
  return useMutationContaFinanceira(
    URL_CONTAS_PAGAR,
    (dados: CancelarSemReagendamentoInput) => chamar(`/${id}/cancelar`, 'POST', dados),
    { formulario: true, sucesso: i18next.t('cancelamento.contaPagar.sucesso') },
  );
}

export function useBaixarContaPagar(id: string) {
  return useMutationContaFinanceira(
    URL_CONTAS_PAGAR,
    (dados: BaixarContaPagarInput) => chamar(`/${id}/baixar`, 'POST', dados),
    { formulario: true, sucesso: 'Pagamento registrado.' },
  );
}

/** Aprova a conta aguardando aprovação (issue #164). */
export function useAprovarContaPagar() {
  return useMutationContaFinanceira(
    URL_CONTAS_PAGAR,
    (id: string) => chamar(`/${id}/aprovar`, 'POST'),
    { sucesso: 'Conta a pagar aprovada.' },
  );
}

/** Recusa a conta aguardando aprovação, com motivo. */
export function useRecusarContaPagar(id: string) {
  return useMutationContaFinanceira(
    URL_CONTAS_PAGAR,
    (dados: RecusarContaPagarInput) => chamar(`/${id}/recusar`, 'POST', dados),
    { formulario: true, sucesso: 'Conta a pagar recusada.' },
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

/**
 * `POST /contas-pagar/duplicidade`: possíveis títulos iguais ao que está sendo lançado (issue
 * #163). Na edição, `contaPagarId` faz a API ignorar a própria conta e o que não mudou.
 */
export function verificarDuplicidadeContaPagar(
  dados: VerificarDuplicidadeContaPagarInput,
): Promise<ContaPagarPossivelDuplicada[]> {
  return apiFetch(`${URL_CONTAS_PAGAR}/duplicidade`, {
    method: 'POST',
    body: dados,
    schema: verificacaoDuplicidadeContaPagarSchema,
  }).then((r) => r.candidatos);
}
