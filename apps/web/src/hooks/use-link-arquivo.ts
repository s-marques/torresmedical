import { arquivoLinkSchema } from '@torres/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

/** Link temporário para exibir um arquivo (avatar, logo, foto). Sem id, não busca. */
export function useLinkArquivo(arquivoId: string | null) {
  return useQuery({
    queryKey: ['arquivo-link', arquivoId],
    enabled: arquivoId !== null,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      apiFetch(`/api/arquivos/${arquivoId}/link`, { schema: arquivoLinkSchema, signal }),
  });
}
