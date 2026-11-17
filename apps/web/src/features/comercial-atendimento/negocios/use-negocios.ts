import {
  motivoPerdaListaSchema,
  negocioSchema,
  pipelineListaSchema,
  resumoQuadroSchema,
  responsavelListaSchema,
  type NegocioTelaInput,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_NEGOCIOS = '/api/comercial-atendimento/negocios';

/** Tudo da tela fora do grid (resumo e listas de apoio) fica sob a mesma chave. */
const CHAVE = ['negocios'] as const;

export function usePipelinesNegocios() {
  return useQuery({
    queryKey: [...CHAVE, 'pipelines'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_NEGOCIOS}/pipelines`, { schema: pipelineListaSchema, signal }),
  });
}

export function useMotivosPerdaNegocios() {
  return useQuery({
    queryKey: [...CHAVE, 'motivos-perda'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_NEGOCIOS}/motivos-perda`, { schema: motivoPerdaListaSchema, signal }),
  });
}

export function useResponsaveisNegocios() {
  return useQuery({
    queryKey: [...CHAVE, 'responsaveis'],
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_NEGOCIOS}/responsaveis`, { schema: responsavelListaSchema, signal }),
  });
}

/** Cartões do cabeçalho: seguem a busca e o pipeline do grid. */
export function useResumoNegocios(filtros: { search?: string; pipelineId?: string }) {
  return useQuery({
    queryKey: [...CHAVE, 'resumo', filtros.search ?? '', filtros.pipelineId ?? ''],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_NEGOCIOS}/resumo`, {
        query: { search: filtros.search, pipelineId: filtros.pipelineId },
        schema: resumoQuadroSchema,
        signal,
      }),
  });
}

type Metodo = 'POST' | 'PATCH' | 'DELETE';

/** Mutation da tela: recarrega o grid e o resumo e mostra o toast. */
function useEscrita<V>(
  chamar: (variaveis: V) => Promise<unknown>,
  sucesso: string,
  formulario = false,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chamar,
    ...(formulario ? { meta: META_FORMULARIO } : {}),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_NEGOCIOS] }),
        queryClient.invalidateQueries({ queryKey: CHAVE }),
        // O quadro da tela Pipeline mostra os mesmos negócios.
        queryClient.invalidateQueries({ queryKey: ['pipeline'] }),
      ]);
      toast.success(sucesso);
    },
  });
}

const negocio = (path: string, method: Metodo, body?: unknown) =>
  apiFetch(`${URL_NEGOCIOS}${path}`, { method, body, schema: negocioSchema });

export function useCriarNegocioTela() {
  return useEscrita(
    (dados: NegocioTelaInput) => negocio('', 'POST', dados),
    'Negócio criado.',
    true,
  );
}

export function useEditarNegocioTela(id: string) {
  return useEscrita(
    (dados: NegocioTelaInput) => negocio(`/${id}`, 'PATCH', dados),
    'Negócio atualizado.',
    true,
  );
}

export function useExcluirNegocioTela() {
  return useEscrita((id: string) => negocio(`/${id}`, 'DELETE'), 'Negócio excluído.');
}
