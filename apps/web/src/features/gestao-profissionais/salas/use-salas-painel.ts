import { salaDashboardSchema, salaOcupacaoSchema } from '@torres/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { URL_SALAS } from './use-salas';

/** As chaves começam com `salas`: qualquer alteração de sala ou contrato recarrega o painel. */
export function useOcupacaoSemana(inicio: string) {
  return useQuery({
    queryKey: ['salas', 'ocupacao', inicio],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_SALAS}/ocupacao`, {
        query: { inicio },
        schema: salaOcupacaoSchema,
        signal,
      }),
  });
}

export function useDashboardSalas() {
  return useQuery({
    queryKey: ['salas', 'dashboard'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_SALAS}/dashboard`, { schema: salaDashboardSchema, signal }),
  });
}
