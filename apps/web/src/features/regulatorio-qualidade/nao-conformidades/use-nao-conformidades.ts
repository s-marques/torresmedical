import { naoConformidadeSchema, type CreateNaoConformidadeInput } from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_NAO_CONFORMIDADES = '/api/regulatorio-qualidade/nao-conformidades';

export function useRegistrarNaoConformidade() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: CreateNaoConformidadeInput) =>
      apiFetch(URL_NAO_CONFORMIDADES, {
        method: 'POST',
        body: dados,
        schema: naoConformidadeSchema,
      }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_NAO_CONFORMIDADES] });
      toast.success(t('naoConformidades.registrada'));
    },
  });
}
