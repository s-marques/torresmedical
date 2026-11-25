import {
  centroCustoSchema,
  type CreateCentroCustoInput,
  type UpdateCentroCustoInput,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api/client';
import { useMutationContaFinanceira } from '../contas-financeiras/use-mutation-conta';

export const URL_CENTROS_CUSTO = '/api/financeiro/centros-custo';

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_CENTROS_CUSTO}${path}`, { method, body, schema: centroCustoSchema });
}

export function useCriarCentroCusto() {
  const { t } = useTranslation();
  return useMutationContaFinanceira(
    URL_CENTROS_CUSTO,
    (dados: CreateCentroCustoInput) => chamar('', 'POST', dados),
    { formulario: true, sucesso: t('contasPagar.centrosCusto.criado') },
  );
}

export function useEditarCentroCusto(id: string) {
  const { t } = useTranslation();
  return useMutationContaFinanceira(
    URL_CENTROS_CUSTO,
    (dados: UpdateCentroCustoInput) => chamar(`/${id}`, 'PATCH', dados),
    { formulario: true, sucesso: t('contasPagar.centrosCusto.atualizado') },
  );
}

/** Interruptor Ativar/Desativar da linha (o centro inativo some do combobox das contas). */
export function useAlternarCentroCusto() {
  const { t } = useTranslation();
  return useMutationContaFinanceira(
    URL_CENTROS_CUSTO,
    ({ id, ativo }: { id: string; ativo: boolean }) => chamar(`/${id}`, 'PATCH', { ativo }),
    { sucesso: t('contasPagar.centrosCusto.atualizado') },
  );
}

export function useExcluirCentroCusto() {
  const { t } = useTranslation();
  return useMutationContaFinanceira(URL_CENTROS_CUSTO, (id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: t('contasPagar.centrosCusto.excluido'),
  });
}
