import { resumoNpsSchema, type PeriodoNps } from '@torres/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

export const URL_PESQUISA_NPS = '/api/comercial-atendimento/pesquisa-nps';

const CHAVE = ['pesquisa-nps'] as const;

/** Cartões do Dashboard para o período aplicado (o mesmo que filtra a lista de Respostas). */
export function useResumoNps(periodo: Required<PeriodoNps>) {
  return useQuery({
    queryKey: [...CHAVE, 'resumo', periodo.de, periodo.ate],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PESQUISA_NPS}/resumo`, { query: periodo, schema: resumoNpsSchema, signal }),
  });
}

/** Recarrega os cartões e a lista de Respostas ("Carregar"). */
export function useRecarregarPesquisaNps() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: CHAVE }),
      queryClient.invalidateQueries({ queryKey: ['data-grid', URL_PESQUISA_NPS] }),
    ]);
}
