import { useQuery } from '@tanstack/react-query';
import { motivosDoTipoSchema, type MotivoOpcao, type TipoCancelamento } from '@torres/shared';
import { apiFetch } from '@/lib/api/client';

export const URL_MOTIVOS_CANCELAMENTO = '/api/cancelamentos/motivos';

/** Motivos ativos do tipo, na ordem da lista (cadastro em Configurações). */
export function useMotivosCancelamento(tipo: TipoCancelamento) {
  return useQuery({
    queryKey: ['cancelamentos', 'motivos', tipo],
    queryFn: ({ signal }): Promise<MotivoOpcao[]> =>
      apiFetch(URL_MOTIVOS_CANCELAMENTO, { query: { tipo }, schema: motivosDoTipoSchema, signal }),
  });
}
