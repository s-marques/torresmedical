import {
  lancamentoConciliacaoPageSchema,
  resumoConciliacaoSchema,
  type ConciliacaoTipoLancamento,
} from '@torres/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { hojeISO } from '@/lib/datas';

export const URL_LANCAMENTOS = '/api/financeiro/conciliacao/lancamentos';
export const URL_RESUMO = '/api/financeiro/conciliacao/resumo';

/** Lançamentos por página do painel "Lançamentos do Sistema". */
export const LANCAMENTOS_POR_PAGINA = 20;

export interface Periodo {
  de: string;
  ate: string;
}

/** Período inicial da aba: os últimos 30 dias até hoje. */
export function periodoInicial(agora = new Date()): Periodo {
  const inicio = new Date(agora);
  inicio.setDate(inicio.getDate() - 30);
  return { de: hojeISO(inicio), ate: hojeISO(agora) };
}

const periodoValido = ({ de, ate }: Periodo) => Boolean(de && ate && de <= ate);

/** Card "Saldo Sistema" do período. */
export function useResumoConciliacao(periodo: Periodo) {
  return useQuery({
    queryKey: ['conciliacao', 'resumo', periodo],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_RESUMO}?${new URLSearchParams({ ...periodo })}`, {
        schema: resumoConciliacaoSchema,
        signal,
      }),
    enabled: periodoValido(periodo),
  });
}

export interface FiltrosLancamentos extends Periodo {
  tipo: ConciliacaoTipoLancamento;
  /** Vazio: "Todas as contas". */
  contaBancariaId: string;
  page: number;
}

/** Painel "Lançamentos do Sistema". */
export function useLancamentosConciliacao(filtros: FiltrosLancamentos) {
  const params = new URLSearchParams({
    de: filtros.de,
    ate: filtros.ate,
    tipo: filtros.tipo,
    page: String(filtros.page),
    pageSize: String(LANCAMENTOS_POR_PAGINA),
  });
  if (filtros.contaBancariaId) params.set('contaBancariaId', filtros.contaBancariaId);
  return useQuery({
    queryKey: ['conciliacao', 'lancamentos', filtros],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_LANCAMENTOS}?${params}`, { schema: lancamentoConciliacaoPageSchema, signal }),
    enabled: periodoValido(filtros),
    placeholderData: keepPreviousData,
  });
}
