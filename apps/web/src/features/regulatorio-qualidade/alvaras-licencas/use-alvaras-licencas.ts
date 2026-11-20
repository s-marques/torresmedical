import {
  licencaListaSchema,
  licencaResumoSchema,
  licencaSchema,
  tipoLicencaListSchema,
  tipoLicencaSchema,
  type CreateLicencaInput,
  type CreateTipoLicencaInput,
  type UpdateLicencaInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_LICENCAS = '/api/regulatorio-qualidade/licencas';
export const URL_TIPOS_LICENCA = '/api/regulatorio-qualidade/tipos-licenca';

const CHAVE = 'alvaras-licencas';

function consulta(unidadeId: string): string {
  return unidadeId ? `?unidadeId=${unidadeId}` : '';
}

/** Tipos de licença do combo "Tipo de Licenca". */
export function useTiposLicenca() {
  return useQuery({
    queryKey: [CHAVE, 'tipos'],
    queryFn: () => apiFetch(URL_TIPOS_LICENCA, { schema: tipoLicencaListSchema }),
  });
}

/** Cartões de totais do topo, filtrados pela unidade escolhida. */
export function useResumoLicencas(unidadeId: string) {
  return useQuery({
    queryKey: [CHAVE, 'resumo', unidadeId],
    queryFn: () =>
      apiFetch(`${URL_LICENCAS}/resumo${consulta(unidadeId)}`, { schema: licencaResumoSchema }),
  });
}

/** Abas Alertas (`alertas`) e Ordem Renovação (`ordem-renovacao`). */
export function useListaLicencas(recurso: 'alertas' | 'ordem-renovacao', unidadeId: string) {
  return useQuery({
    queryKey: [CHAVE, recurso, unidadeId],
    queryFn: () =>
      apiFetch(`${URL_LICENCAS}/${recurso}${consulta(unidadeId)}`, { schema: licencaListaSchema }),
  });
}

function useAposGravar(mensagem: string) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['data-grid', URL_LICENCAS] }),
      queryClient.invalidateQueries({ queryKey: [CHAVE] }),
    ]);
    toast.success(mensagem);
  };
}

export function useCriarTipoLicenca() {
  const { t } = useTranslation();
  const aposGravar = useAposGravar(t('alvarasLicencas.tipoCriado'));
  return useMutation({
    mutationFn: (dados: CreateTipoLicencaInput) =>
      apiFetch(URL_TIPOS_LICENCA, { method: 'POST', body: dados, schema: tipoLicencaSchema }),
    meta: META_FORMULARIO,
    onSuccess: aposGravar,
  });
}

export function useCriarLicenca() {
  const { t } = useTranslation();
  const aposGravar = useAposGravar(t('alvarasLicencas.licencaCriada'));
  return useMutation({
    mutationFn: (dados: CreateLicencaInput) =>
      apiFetch(URL_LICENCAS, { method: 'POST', body: dados, schema: licencaSchema }),
    meta: META_FORMULARIO,
    onSuccess: aposGravar,
  });
}

export function useEditarLicenca(id: string) {
  const { t } = useTranslation();
  const aposGravar = useAposGravar(t('alvarasLicencas.licencaAtualizada'));
  return useMutation({
    mutationFn: (dados: UpdateLicencaInput) =>
      apiFetch(`${URL_LICENCAS}/${id}`, { method: 'PATCH', body: dados, schema: licencaSchema }),
    meta: META_FORMULARIO,
    onSuccess: aposGravar,
  });
}
