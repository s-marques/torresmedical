import { healthResponseSchema } from '@torres/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

export type ApiHealthStatus = 'checking' | 'online' | 'offline';

const INTERVALO_MS = 30_000;

/** Saúde da API (`GET /api/health`), consultada a cada 30 s. Falha não gera toast. */
export function useApiHealth(): ApiHealthStatus {
  const { status } = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiFetch('/api/health', { schema: healthResponseSchema, signal }),
    refetchInterval: INTERVALO_MS,
    retry: false,
    meta: { tratarErro: false },
  });
  if (status === 'pending') return 'checking';
  return status === 'success' ? 'online' : 'offline';
}
