import {
  acompanhamentoMetasSchema,
  metaComercialSchema,
  responsavelListaSchema,
  type AcompanhamentoMetasQuery,
  type MetaComercialInput,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { i18next } from '@/lib/i18n';

export const URL_METAS = '/api/comercial-atendimento/metas';

/** Tudo da tela fora do grid (acompanhamento e lista de responsáveis) fica sob a mesma chave. */
const CHAVE = ['metas'] as const;

export function useResponsaveisMetas() {
  return useQuery({
    queryKey: [...CHAVE, 'responsaveis'],
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_METAS}/responsaveis`, { schema: responsavelListaSchema, signal }),
  });
}

/** Projetado × realizado por métrica e a evolução período a período, para os filtros dados. */
export function useAcompanhamentoMetas(filtros: AcompanhamentoMetasQuery) {
  return useQuery({
    queryKey: [...CHAVE, 'acompanhamento', filtros],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_METAS}/acompanhamento`, {
        query: { ...filtros },
        schema: acompanhamentoMetasSchema,
        signal,
      }),
  });
}

/** Mutation da tela: recarrega grid e acompanhamento e mostra o toast. */
function useEscrita<V>(
  chamar: (variaveis: V) => Promise<unknown>,
  chaveSucesso: string,
  formulario = false,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chamar,
    ...(formulario ? { meta: META_FORMULARIO } : {}),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_METAS] }),
        queryClient.invalidateQueries({ queryKey: CHAVE }),
      ]);
      toast.success(i18next.t(chaveSucesso));
    },
  });
}

const meta = (path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) =>
  apiFetch(`${URL_METAS}${path}`, { method, body, schema: metaComercialSchema });

export function useCriarMeta() {
  return useEscrita(
    (dados: MetaComercialInput) => meta('', 'POST', dados),
    'metas.sucesso.criada',
    true,
  );
}

export function useEditarMeta(id: string) {
  return useEscrita(
    (dados: MetaComercialInput) => meta(`/${id}`, 'PATCH', dados),
    'metas.sucesso.atualizada',
    true,
  );
}

export function useExcluirMeta() {
  return useEscrita((id: string) => meta(`/${id}`, 'DELETE'), 'metas.sucesso.excluida');
}
