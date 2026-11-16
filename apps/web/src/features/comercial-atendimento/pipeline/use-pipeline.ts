import {
  atividadeNegocioSchema,
  estagioSchema,
  motivoPerdaListaSchema,
  motivoPerdaSchema,
  negocioSchema,
  origemClientePageSchema,
  origemClienteSchema,
  PAGE_SIZE_MAX,
  pipelineListaSchema,
  pipelineSchema,
  quadroSchema,
  responsavelListaSchema,
  type AtividadeNegocioInput,
  type EstagioInput,
  type MotivoPerdaInput,
  type NegocioInput,
  type PerderNegocioInput,
  type PipelineInput,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_PIPELINE = '/api/comercial-atendimento/pipeline';

/** Tudo da tela fica sob a mesma chave: uma escrita atualiza quadro, pipelines e motivos. */
const CHAVE = ['pipeline'] as const;

export function usePipelines() {
  return useQuery({
    queryKey: [...CHAVE, 'pipelines'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PIPELINE}/pipelines`, { schema: pipelineListaSchema, signal }),
  });
}

export function useQuadro(pipelineId: string | undefined, search: string) {
  return useQuery({
    queryKey: [...CHAVE, 'quadro', pipelineId, search],
    enabled: Boolean(pipelineId),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PIPELINE}/quadro`, {
        query: { pipelineId, search: search || undefined },
        schema: quadroSchema,
        signal,
      }),
  });
}

export function useMotivosPerda() {
  return useQuery({
    queryKey: [...CHAVE, 'motivos-perda'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PIPELINE}/motivos-perda`, { schema: motivoPerdaListaSchema, signal }),
  });
}

export function useResponsaveis() {
  return useQuery({
    queryKey: [...CHAVE, 'responsaveis'],
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PIPELINE}/responsaveis`, { schema: responsavelListaSchema, signal }),
  });
}

type Metodo = 'POST' | 'PATCH' | 'DELETE';

interface Escrita<V> {
  chamar: (variaveis: V) => Promise<unknown>;
  sucesso: string;
  formulario?: boolean;
}

/** Mutation da tela: chama a API, recarrega os dados do pipeline e mostra o toast. */
function useEscrita<V>({ chamar, sucesso, formulario }: Escrita<V>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chamar,
    ...(formulario ? { meta: META_FORMULARIO } : {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE });
      toast.success(sucesso);
    },
  });
}

const negocio = (path: string, method: Metodo, body?: unknown) =>
  apiFetch(`${URL_PIPELINE}/negocios${path}`, { method, body, schema: negocioSchema });

export function useCriarNegocio() {
  return useEscrita({
    chamar: (dados: NegocioInput) => negocio('', 'POST', dados),
    sucesso: 'Negócio criado.',
    formulario: true,
  });
}

export function useEditarNegocio(id: string) {
  return useEscrita({
    chamar: (dados: NegocioInput) => negocio(`/${id}`, 'PATCH', dados),
    sucesso: 'Negócio atualizado.',
    formulario: true,
  });
}

export function useMoverNegocio() {
  return useEscrita({
    chamar: ({ id, estagioId }: { id: string; estagioId: string }) =>
      negocio(`/${id}/mover`, 'PATCH', { estagioId }),
    sucesso: 'Negócio movido.',
  });
}

export function useGanharNegocio() {
  return useEscrita({
    chamar: (id: string) => negocio(`/${id}/ganho`, 'PATCH'),
    sucesso: 'Negócio marcado como ganho.',
  });
}

export function usePerderNegocio(id: string) {
  return useEscrita({
    chamar: (dados: PerderNegocioInput) => negocio(`/${id}/perdido`, 'PATCH', dados),
    sucesso: 'Negócio marcado como perdido.',
    formulario: true,
  });
}

export function useExcluirNegocio() {
  return useEscrita({
    chamar: (id: string) => negocio(`/${id}`, 'DELETE'),
    sucesso: 'Negócio excluído.',
  });
}

export function useAgendarFollowUp(negocioId: string) {
  return useEscrita({
    chamar: (dados: AtividadeNegocioInput) =>
      apiFetch(`${URL_PIPELINE}/negocios/${negocioId}/atividades`, {
        method: 'POST',
        body: dados,
        schema: atividadeNegocioSchema,
      }),
    sucesso: 'Follow-up agendado.',
    formulario: true,
  });
}

export function useConcluirAtividade() {
  return useEscrita({
    chamar: (id: string) =>
      apiFetch(`${URL_PIPELINE}/atividades/${id}/concluir`, {
        method: 'PATCH',
        schema: atividadeNegocioSchema,
      }),
    sucesso: 'Próxima ação concluída.',
  });
}

// ---------- Configurações do CRM ----------

export function useCriarPipeline() {
  return useEscrita({
    chamar: (dados: PipelineInput) =>
      apiFetch(`${URL_PIPELINE}/pipelines`, {
        method: 'POST',
        body: dados,
        schema: pipelineSchema,
      }),
    sucesso: 'Pipeline criado.',
  });
}

export function useEditarPipeline() {
  return useEscrita({
    chamar: ({ id, ...dados }: PipelineInput & { id: string }) =>
      apiFetch(`${URL_PIPELINE}/pipelines/${id}`, {
        method: 'PATCH',
        body: dados,
        schema: pipelineSchema,
      }),
    sucesso: 'Pipeline atualizado.',
  });
}

export function useExcluirPipeline() {
  return useEscrita({
    chamar: (id: string) =>
      apiFetch(`${URL_PIPELINE}/pipelines/${id}`, { method: 'DELETE', schema: pipelineSchema }),
    sucesso: 'Pipeline excluído.',
  });
}

export function useCriarEstagio(pipelineId: string) {
  return useEscrita({
    chamar: (dados: EstagioInput) =>
      apiFetch(`${URL_PIPELINE}/pipelines/${pipelineId}/estagios`, {
        method: 'POST',
        body: dados,
        schema: estagioSchema,
      }),
    sucesso: 'Estágio adicionado.',
  });
}

export function useEditarEstagio() {
  return useEscrita({
    chamar: ({ id, ...dados }: EstagioInput & { id: string }) =>
      apiFetch(`${URL_PIPELINE}/estagios/${id}`, {
        method: 'PATCH',
        body: dados,
        schema: estagioSchema,
      }),
    sucesso: 'Estágio atualizado.',
  });
}

export function useExcluirEstagio() {
  return useEscrita({
    chamar: (id: string) =>
      apiFetch(`${URL_PIPELINE}/estagios/${id}`, { method: 'DELETE', schema: estagioSchema }),
    sucesso: 'Estágio excluído.',
  });
}

export function useCriarMotivoPerda() {
  return useEscrita({
    chamar: (dados: MotivoPerdaInput) =>
      apiFetch(`${URL_PIPELINE}/motivos-perda`, {
        method: 'POST',
        body: dados,
        schema: motivoPerdaSchema,
      }),
    sucesso: 'Motivo adicionado.',
  });
}

export function useEditarMotivoPerda() {
  return useEscrita({
    chamar: ({ id, ...dados }: MotivoPerdaInput & { id: string }) =>
      apiFetch(`${URL_PIPELINE}/motivos-perda/${id}`, {
        method: 'PATCH',
        body: dados,
        schema: motivoPerdaSchema,
      }),
    sucesso: 'Motivo atualizado.',
  });
}

export function useExcluirMotivoPerda() {
  return useEscrita({
    chamar: (id: string) =>
      apiFetch(`${URL_PIPELINE}/motivos-perda/${id}`, {
        method: 'DELETE',
        schema: motivoPerdaSchema,
      }),
    sucesso: 'Motivo excluído.',
  });
}

// ---------- Origens do negócio (cadastro Origens de Cliente) ----------

const URL_ORIGENS = '/api/comercial-atendimento/origens-cliente';

/** Origens ativas e inativas, na ordem da lista (até 100, o máximo de uma página). */
export function useOrigensNegocio() {
  return useQuery({
    queryKey: [...CHAVE, 'origens'],
    queryFn: ({ signal }) =>
      apiFetch(URL_ORIGENS, {
        query: { pageSize: PAGE_SIZE_MAX, sort: 'ordem:asc' },
        schema: origemClientePageSchema,
        signal,
      }),
  });
}

/** Escrita nas origens: também atualiza o grid da tela Origens de Cliente. */
function useEscritaOrigem<V>(chamar: (v: V) => Promise<unknown>, sucesso: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chamar,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE });
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_ORIGENS] });
      toast.success(sucesso);
    },
  });
}

export function useCriarOrigemNegocio() {
  return useEscritaOrigem(
    (dados: { nome: string }) =>
      apiFetch(URL_ORIGENS, { method: 'POST', body: dados, schema: origemClienteSchema }),
    'Origem adicionada.',
  );
}

export function useRenomearOrigemNegocio() {
  return useEscritaOrigem(
    ({ id, nome }: { id: string; nome: string }) =>
      apiFetch(`${URL_ORIGENS}/${id}`, {
        method: 'PATCH',
        body: { nome },
        schema: origemClienteSchema,
      }),
    'Origem atualizada.',
  );
}

export function useExcluirOrigemNegocio() {
  return useEscritaOrigem(
    (id: string) =>
      apiFetch(`${URL_ORIGENS}/${id}`, { method: 'DELETE', schema: origemClienteSchema }),
    'Origem excluída.',
  );
}
