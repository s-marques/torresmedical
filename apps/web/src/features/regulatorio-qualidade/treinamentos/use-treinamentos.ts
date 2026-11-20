import {
  tipoTreinamentoListSchema,
  tipoTreinamentoSchema,
  treinamentoSchema,
  type CreateTipoTreinamentoInput,
  type CreateTreinamentoInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_TREINAMENTOS = '/api/regulatorio-qualidade/treinamentos';
export const URL_TIPOS_TREINAMENTO = '/api/regulatorio-qualidade/tipos-treinamento';

const CHAVE_TIPOS = ['treinamentos', 'tipos'];

/** Tipos de treinamento do combo "Tipo". */
export function useTiposTreinamento() {
  return useQuery({
    queryKey: CHAVE_TIPOS,
    queryFn: () => apiFetch(URL_TIPOS_TREINAMENTO, { schema: tipoTreinamentoListSchema }),
  });
}

export function useCriarTipoTreinamento() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: CreateTipoTreinamentoInput) =>
      apiFetch(URL_TIPOS_TREINAMENTO, {
        method: 'POST',
        body: dados,
        schema: tipoTreinamentoSchema,
      }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE_TIPOS });
      toast.success(t('treinamentos.tipoCriado'));
    },
  });
}

export function useCadastrarTreinamento() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: CreateTreinamentoInput) =>
      apiFetch(URL_TREINAMENTOS, { method: 'POST', body: dados, schema: treinamentoSchema }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_TREINAMENTOS] });
      toast.success(t('treinamentos.cadastrado'));
    },
  });
}
