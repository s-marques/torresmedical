import { auditEntidadesSchema } from '@torres/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

export const URL_AUDITORIA = '/api/auditoria';

/** Entidades que já têm registro na trilha: opções do filtro "Entidade". */
export function useEntidadesAuditoria() {
  return useQuery({
    queryKey: ['auditoria', 'entidades'],
    queryFn: () => apiFetch(`${URL_AUDITORIA}/entidades`, { schema: auditEntidadesSchema }),
    staleTime: 5 * 60 * 1000,
  });
}
