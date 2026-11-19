import { useQuery } from '@tanstack/react-query';
import {
  receitaProfissionalSchema,
  resumoReceitaProfissionaisSchema,
  type UpdateReceitaProfissionalInput,
} from '@torres/shared';
import { apiFetch } from '@/lib/api/client';
import { i18next } from '@/lib/i18n';
import { useMutationContaFinanceira } from '../../financeiro/contas-financeiras/use-mutation-conta';

export const URL_RECEITA_PROFISSIONAIS = '/api/gestao-profissionais/receita-profissionais';

/** Prefixo das consultas de totais, para refazê-las depois de editar, estornar ou excluir. */
export const CHAVE_RESUMO_RECEITAS = ['receita-profissionais', 'resumo'] as const;

/** Parâmetros dos filtros do grid que também valem para os cards de totais. */
export const PARAMETROS_FILTRO_RECEITAS = [
  'search',
  'status',
  'profissionalId',
  'formaPagamentoId',
  'vencimentoDe',
  'vencimentoAte',
] as const;

/** Cards "Total Recebido", "Total Pendente", "Registros" e "Resumo por Profissional". */
export function useResumoReceitas(filtros: Readonly<Record<string, string>>) {
  return useQuery({
    queryKey: [...CHAVE_RESUMO_RECEITAS, filtros],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_RECEITA_PROFISSIONAIS}/resumo`, {
        query: filtros,
        schema: resumoReceitaProfissionaisSchema,
        signal,
      }),
  });
}

function useMutationReceita<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<unknown>,
  sucesso: string,
  formulario = false,
) {
  return useMutationContaFinanceira(URL_RECEITA_PROFISSIONAIS, mutationFn, {
    formulario,
    sucesso,
    invalidar: CHAVE_RESUMO_RECEITAS,
  });
}

export function useEditarReceita(id: string) {
  return useMutationReceita(
    (dados: UpdateReceitaProfissionalInput) =>
      apiFetch(`${URL_RECEITA_PROFISSIONAIS}/${id}`, {
        method: 'PATCH',
        body: dados,
        schema: receitaProfissionalSchema,
      }),
    i18next.t('receitaProfissionais.editada'),
    true,
  );
}

export function useEstornarBaixaReceita() {
  return useMutationReceita(
    (id: string) =>
      apiFetch(`${URL_RECEITA_PROFISSIONAIS}/${id}/estornar-baixa`, {
        method: 'POST',
        schema: receitaProfissionalSchema,
      }),
    i18next.t('receitaProfissionais.baixaEstornada'),
  );
}

export function useExcluirReceita() {
  return useMutationReceita(
    (id: string) =>
      apiFetch(`${URL_RECEITA_PROFISSIONAIS}/${id}`, {
        method: 'DELETE',
        schema: receitaProfissionalSchema,
      }),
    i18next.t('receitaProfissionais.excluida'),
  );
}
