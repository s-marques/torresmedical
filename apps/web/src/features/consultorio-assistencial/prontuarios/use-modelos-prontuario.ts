import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  modeloProntuarioPageSchema,
  modeloProntuarioSchema,
  type CreateModeloPadraoInput,
  type CreateModeloProprioInput,
  type ModeloProntuario,
  type UpdateModeloInput,
} from '@torres/shared';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { i18next } from '@/lib/i18n';

export const URL_MODELOS = '/api/consultorio-assistencial/modelos-prontuario';

const urlModelo = (padrao: boolean, id?: string) =>
  [URL_MODELOS, padrao ? 'padrao' : null, id].filter(Boolean).join('/');

/** Modelos ativos que o profissional pode usar no atendimento: os padrão e os dele. */
export function useModelosDoProfissional(profissionalId: string | null) {
  return useQuery({
    queryKey: ['modelos-prontuario', 'disponiveis', profissionalId] as const,
    enabled: profissionalId !== null,
    queryFn: ({ signal }) =>
      apiFetch(URL_MODELOS, {
        schema: modeloProntuarioPageSchema,
        query: { profissionalId, somenteAtivos: 'true', pageSize: 100, sort: 'nome:asc' },
        signal,
      }),
  });
}

/** Alterar um modelo atualiza o grid e a lista de modelos do seletor do atendimento. */
function useInvalidarModelos() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['data-grid', URL_MODELOS] }),
      queryClient.invalidateQueries({ queryKey: ['modelos-prontuario'] }),
    ]);
}

export function useCriarModelo(padrao: boolean) {
  const invalidar = useInvalidarModelos();
  return useMutation({
    mutationFn: (
      dados: CreateModeloProprioInput | CreateModeloPadraoInput,
    ): Promise<ModeloProntuario> =>
      apiFetch(urlModelo(padrao), { method: 'POST', body: dados, schema: modeloProntuarioSchema }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await invalidar();
      toast.success(i18next.t('modelosProntuario.mensagens.criado'));
    },
  });
}

export function useAtualizarModelo(id: string, padrao: boolean) {
  const invalidar = useInvalidarModelos();
  return useMutation({
    mutationFn: (dados: UpdateModeloInput): Promise<ModeloProntuario> =>
      apiFetch(urlModelo(padrao, id), {
        method: 'PATCH',
        body: dados,
        schema: modeloProntuarioSchema,
      }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await invalidar();
      toast.success(i18next.t('modelosProntuario.mensagens.atualizado'));
    },
  });
}

export function useExcluirModelo() {
  const invalidar = useInvalidarModelos();
  return useMutation({
    mutationFn: ({ id, padrao }: { id: string; padrao: boolean }): Promise<ModeloProntuario> =>
      apiFetch(urlModelo(padrao, id), { method: 'DELETE', schema: modeloProntuarioSchema }),
    onSuccess: async () => {
      await invalidar();
      toast.success(i18next.t('modelosProntuario.mensagens.excluido'));
    },
  });
}
