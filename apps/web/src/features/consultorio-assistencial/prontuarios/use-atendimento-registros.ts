import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  arquivoLinkSchema,
  atendimentoAnexoListaSchema,
  atendimentoAnexoSchema,
  atendimentoDocumentoListaSchema,
  atendimentoDocumentoSchema,
  atendimentoSchema,
  atendimentoVersaoListaSchema,
  atendimentoVersaoSchema,
  type AssinaturaInput,
  type CreateAdendoInput,
  type CreateAtendimentoAnexoInput,
  type CreateAtendimentoDocumentoInput,
  type UpdateAtendimentoInput,
} from '@torres/shared';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { i18next } from '@/lib/i18n';
import { URL_PRONTUARIOS } from './use-prontuarios';

function urlAtendimento(pacienteId: string, atendimentoId: string, resto = ''): string {
  return `${URL_PRONTUARIOS}/${pacienteId}/atendimentos/${atendimentoId}${resto}`;
}

const chave = (recurso: string, atendimentoId: string) =>
  ['prontuarios', 'atendimento', recurso, atendimentoId] as const;

export function useAnexos(pacienteId: string, atendimentoId: string) {
  return useQuery({
    queryKey: chave('anexos', atendimentoId),
    queryFn: ({ signal }) =>
      apiFetch(urlAtendimento(pacienteId, atendimentoId, '/anexos'), {
        schema: atendimentoAnexoListaSchema,
        signal,
      }),
  });
}

export function useDocumentos(pacienteId: string, atendimentoId: string) {
  return useQuery({
    queryKey: chave('documentos', atendimentoId),
    queryFn: ({ signal }) =>
      apiFetch(urlAtendimento(pacienteId, atendimentoId, '/documentos'), {
        schema: atendimentoDocumentoListaSchema,
        signal,
      }),
  });
}

export function useVersoes(pacienteId: string, atendimentoId: string) {
  return useQuery({
    queryKey: chave('versoes', atendimentoId),
    queryFn: ({ signal }) =>
      apiFetch(urlAtendimento(pacienteId, atendimentoId, '/versoes'), {
        schema: atendimentoVersaoListaSchema,
        signal,
      }),
  });
}

/**
 * Mutation do atendimento: ao concluir, atualiza o detalhe, a lista de atendimentos e o
 * histórico clínico, e avisa o sucesso.
 */
function useMutationAtendimento<TVariaveis, TResultado>(
  pacienteId: string,
  atendimentoId: string,
  mutationFn: (variaveis: TVariaveis) => Promise<TResultado>,
  { formulario = true, sucesso }: { formulario?: boolean; sucesso: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['prontuarios', 'atendimento'] }),
        queryClient.invalidateQueries({ queryKey: ['prontuarios', 'atendimentos', pacienteId] }),
        queryClient.invalidateQueries({
          queryKey: ['prontuarios', 'historico-clinico', pacienteId],
        }),
      ]);
      toast.success(i18next.t(sucesso));
    },
  });
}

export function useAtualizarAtendimento(pacienteId: string, atendimentoId: string) {
  return useMutationAtendimento(
    pacienteId,
    atendimentoId,
    (dados: UpdateAtendimentoInput) =>
      apiFetch(urlAtendimento(pacienteId, atendimentoId), {
        method: 'PATCH',
        body: dados,
        schema: atendimentoSchema,
      }),
    { sucesso: 'atendimentoRegistros.mensagens.atualizado' },
  );
}

export function useAssinarAtendimento(pacienteId: string, atendimentoId: string) {
  return useMutationAtendimento(
    pacienteId,
    atendimentoId,
    (dados: AssinaturaInput) =>
      apiFetch(urlAtendimento(pacienteId, atendimentoId, '/assinatura'), {
        method: 'POST',
        body: dados,
        schema: atendimentoSchema,
      }),
    { sucesso: 'atendimentoRegistros.mensagens.assinado' },
  );
}

export function useCriarAdendo(pacienteId: string, atendimentoId: string) {
  return useMutationAtendimento(
    pacienteId,
    atendimentoId,
    (dados: CreateAdendoInput) =>
      apiFetch(urlAtendimento(pacienteId, atendimentoId, '/adendos'), {
        method: 'POST',
        body: dados,
        schema: atendimentoVersaoSchema,
      }),
    { sucesso: 'atendimentoRegistros.mensagens.adendoCriado' },
  );
}

export function useCriarAnexo(pacienteId: string, atendimentoId: string) {
  return useMutationAtendimento(
    pacienteId,
    atendimentoId,
    (dados: CreateAtendimentoAnexoInput) =>
      apiFetch(urlAtendimento(pacienteId, atendimentoId, '/anexos'), {
        method: 'POST',
        body: dados,
        schema: atendimentoAnexoSchema,
      }),
    { sucesso: 'atendimentoRegistros.mensagens.anexoCriado' },
  );
}

export function useRemoverAnexo(pacienteId: string, atendimentoId: string) {
  return useMutationAtendimento(
    pacienteId,
    atendimentoId,
    (anexoId: string) =>
      apiFetch(urlAtendimento(pacienteId, atendimentoId, `/anexos/${anexoId}`), {
        method: 'DELETE',
        schema: atendimentoAnexoSchema,
      }),
    { formulario: false, sucesso: 'atendimentoRegistros.mensagens.anexoRemovido' },
  );
}

export function useCriarDocumentoAtendimento(pacienteId: string, atendimentoId: string) {
  return useMutationAtendimento(
    pacienteId,
    atendimentoId,
    (dados: CreateAtendimentoDocumentoInput) =>
      apiFetch(urlAtendimento(pacienteId, atendimentoId, '/documentos'), {
        method: 'POST',
        body: dados,
        schema: atendimentoDocumentoSchema,
      }),
    { sucesso: 'atendimentoRegistros.mensagens.documentoCriado' },
  );
}

export function useRemoverDocumentoAtendimento(pacienteId: string, atendimentoId: string) {
  return useMutationAtendimento(
    pacienteId,
    atendimentoId,
    (documentoId: string) =>
      apiFetch(urlAtendimento(pacienteId, atendimentoId, `/documentos/${documentoId}`), {
        method: 'DELETE',
        schema: atendimentoDocumentoSchema,
      }),
    { formulario: false, sucesso: 'atendimentoRegistros.mensagens.documentoRemovido' },
  );
}

/** Link temporário do exame ou anexo (o escopo e a permissão são conferidos pela API). */
export function linkDoAnexo(pacienteId: string, atendimentoId: string, anexoId: string) {
  return apiFetch(urlAtendimento(pacienteId, atendimentoId, `/anexos/${anexoId}/link`), {
    schema: arquivoLinkSchema,
  });
}
