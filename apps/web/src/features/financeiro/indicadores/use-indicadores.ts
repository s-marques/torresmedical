import { indicadoresFinanceirosSchema } from '@torres/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

export const URL_INDICADORES = '/api/financeiro/indicadores';

/** Indicadores do mês (`AAAA-MM`). Trocar de mês busca de novo; `refetch` é o botão Atualizar. */
export function useIndicadores(mes: string) {
  return useQuery({
    queryKey: ['financeiro', 'indicadores', mes],
    queryFn: ({ signal }) =>
      apiFetch(URL_INDICADORES, { query: { mes }, schema: indicadoresFinanceirosSchema, signal }),
  });
}
