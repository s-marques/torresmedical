import {
  confirmacaoConfigSchema,
  confirmacaoModeloListaSchema,
  confirmacaoModeloSchema,
  confirmacaoSchema,
  resumoConfirmacoesSchema,
  type ConfirmacaoConfigInput,
  type ConfirmacaoModeloInput,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_CONFIRMACOES = '/api/comercial-atendimento/confirmacoes';

/** Tudo da tela fora dos grids (cartões, configuração e modelos) fica sob a mesma chave. */
const CHAVE = ['confirmacoes'] as const;

export function useResumoConfirmacoes(dataEnvio: string) {
  return useQuery({
    queryKey: [...CHAVE, 'resumo', dataEnvio],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_CONFIRMACOES}/resumo`, {
        query: { dataEnvio: dataEnvio || undefined },
        schema: resumoConfirmacoesSchema,
        signal,
      }),
  });
}

export function useConfiguracaoConfirmacao() {
  return useQuery({
    queryKey: [...CHAVE, 'configuracao'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_CONFIRMACOES}/configuracao`, { schema: confirmacaoConfigSchema, signal }),
  });
}

export function useModelosConfirmacao() {
  return useQuery({
    queryKey: [...CHAVE, 'modelos'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_CONFIRMACOES}/modelos`, { schema: confirmacaoModeloListaSchema, signal }),
  });
}

/** Recarrega grids, cartões, configuração e modelos. */
export function useRecarregarConfirmacoes() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['data-grid', URL_CONFIRMACOES] }),
      queryClient.invalidateQueries({ queryKey: ['data-grid', `${URL_CONFIRMACOES}/historico`] }),
      queryClient.invalidateQueries({ queryKey: CHAVE }),
    ]);
}

function useEscrita<V>(
  chamar: (variaveis: V) => Promise<unknown>,
  sucesso: string,
  formulario = false,
) {
  const recarregar = useRecarregarConfirmacoes();
  return useMutation({
    mutationFn: chamar,
    ...(formulario ? { meta: META_FORMULARIO } : {}),
    onSuccess: async () => {
      await recarregar();
      toast.success(sucesso);
    },
  });
}

export function useSalvarConfiguracao() {
  return useEscrita(
    (dados: ConfirmacaoConfigInput) =>
      apiFetch(`${URL_CONFIRMACOES}/configuracao`, {
        method: 'PUT',
        body: dados,
        schema: confirmacaoConfigSchema,
      }),
    'Configuração salva.',
    true,
  );
}

export function useSalvarModelo(id?: string) {
  return useEscrita(
    (dados: ConfirmacaoModeloInput) =>
      apiFetch(id ? `${URL_CONFIRMACOES}/modelos/${id}` : `${URL_CONFIRMACOES}/modelos`, {
        method: id ? 'PATCH' : 'POST',
        body: dados,
        schema: confirmacaoModeloSchema,
      }),
    id ? 'Modelo atualizado.' : 'Modelo criado.',
    true,
  );
}

export function useExcluirModelo() {
  return useEscrita(
    (id: string) =>
      apiFetch(`${URL_CONFIRMACOES}/modelos/${id}`, {
        method: 'DELETE',
        schema: confirmacaoModeloSchema,
      }),
    'Modelo excluído.',
  );
}

export type AcaoConfirmacao = 'enviar' | 'confirmar' | 'cancelar';

const SUCESSO_ACAO: Record<AcaoConfirmacao, string> = {
  enviar: 'Confirmação enviada.',
  confirmar: 'Agendamento confirmado.',
  cancelar: 'Agendamento cancelado.',
};

/** Ações da linha do grid: Enviar confirmacao, Confirmar e Cancelar. */
export function useAcaoConfirmacao(acao: AcaoConfirmacao) {
  return useEscrita(
    (id: string) =>
      apiFetch(`${URL_CONFIRMACOES}/${id}/${acao}`, { method: 'POST', schema: confirmacaoSchema }),
    SUCESSO_ACAO[acao],
  );
}
