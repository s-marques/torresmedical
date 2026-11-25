import {
  exportacaoLoteEntidadeInfoSchema,
  exportacaoLoteSchema,
  type CreateExportacaoLoteInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18next from 'i18next';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';

export const URL_EXPORTACOES_LOTE = '/api/configuracoes-gestao/exportacoes-lote';

/** Entidades que a API sabe exportar em lote (issue #158). */
export function useEntidadesExportacaoLote() {
  return useQuery({
    queryKey: ['exportacoes-lote', 'entidades'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_EXPORTACOES_LOTE}/entidades`, {
        schema: exportacaoLoteEntidadeInfoSchema.array(),
        signal,
      }),
  });
}

/** Pede a exportação; o ZIP é gerado em segundo plano e o grid se atualiza sozinho. */
export function useSolicitarExportacaoLote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: CreateExportacaoLoteInput) =>
      apiFetch(URL_EXPORTACOES_LOTE, { method: 'POST', body: dados, schema: exportacaoLoteSchema }),
    onSuccess: () => {
      toast.success(i18next.t('exportacaoLote.solicitada'));
      void queryClient.invalidateQueries({ queryKey: ['data-grid', URL_EXPORTACOES_LOTE] });
    },
  });
}
