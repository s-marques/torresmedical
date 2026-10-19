import { dashboardPainelSchema, type AbaPainel, type FiltrosPainelInput } from '@torres/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

/** Dashboard de uma aba. Só a aba aberta é buscada. */
export function useDashboard(aba: AbaPainel, filtros: FiltrosPainelInput) {
  return useQuery({
    queryKey: ['painel', 'dashboard', aba, filtros],
    queryFn: ({ signal }) =>
      apiFetch(`/api/painel/dashboard/${aba}`, {
        query: { ...filtros },
        schema: dashboardPainelSchema,
        signal,
      }),
  });
}
