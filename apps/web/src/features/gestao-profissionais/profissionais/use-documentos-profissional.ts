import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  arquivoLinkSchema,
  profissionalDocumentoSchema,
  profissionalDocumentosResponseSchema,
  type ProfissionalDocumento,
  type ProfissionalDocumentoDecisao,
  type ProfissionalDocumentoInput,
} from '@torres/shared';
import { toast } from 'sonner';
import { i18next } from '@/lib/i18n';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { URL_PROFISSIONAIS } from './use-profissionais';

const CHAVE = 'documentos-profissional';

function urlDocumentos(profissionalId: string, resto = ''): string {
  return `${URL_PROFISSIONAIS}/${profissionalId}/documentos${resto}`;
}

/** Documentos do profissional, pendências e se a documentação está validada. */
export function useDocumentosProfissional(profissionalId: string) {
  return useQuery({
    queryKey: [CHAVE, profissionalId],
    queryFn: ({ signal }) =>
      apiFetch(urlDocumentos(profissionalId), {
        schema: profissionalDocumentosResponseSchema,
        signal,
      }),
  });
}

/** Mutations: ao concluir, a lista é buscada de novo e aparece o aviso de sucesso. */
function useMutationDocumento<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<ProfissionalDocumento>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [CHAVE] });
      toast.success(i18next.t(sucesso));
    },
  });
}

export function useCriarDocumento(profissionalId: string) {
  return useMutationDocumento(
    (dados: ProfissionalDocumentoInput) =>
      apiFetch(urlDocumentos(profissionalId), {
        method: 'POST',
        body: dados,
        schema: profissionalDocumentoSchema,
      }),
    { formulario: true, sucesso: 'profissionalDocumentos.mensagens.criado' },
  );
}

export function useAtualizarDocumento(profissionalId: string, documentoId: string) {
  return useMutationDocumento(
    (dados: ProfissionalDocumentoInput) =>
      apiFetch(urlDocumentos(profissionalId, `/${documentoId}`), {
        method: 'PATCH',
        body: dados,
        schema: profissionalDocumentoSchema,
      }),
    { formulario: true, sucesso: 'profissionalDocumentos.mensagens.atualizado' },
  );
}

export function useDecidirDocumento(profissionalId: string) {
  return useMutationDocumento(
    ({
      documentoId,
      decisao,
    }: {
      documentoId: string;
      decisao: Pick<ProfissionalDocumentoDecisao, 'decisao'> & { motivo?: string | null };
    }) =>
      apiFetch(urlDocumentos(profissionalId, `/${documentoId}/validacao`), {
        method: 'POST',
        body: decisao,
        schema: profissionalDocumentoSchema,
      }),
    { formulario: true, sucesso: 'profissionalDocumentos.mensagens.decidido' },
  );
}

export function useRemoverDocumento(profissionalId: string) {
  return useMutationDocumento(
    (documentoId: string) =>
      apiFetch(urlDocumentos(profissionalId, `/${documentoId}`), {
        method: 'DELETE',
        schema: profissionalDocumentoSchema,
      }),
    { sucesso: 'profissionalDocumentos.mensagens.removido' },
  );
}

/** Link temporário do arquivo do documento (a permissão é conferida pela API). */
export function linkDoDocumento(profissionalId: string, documentoId: string) {
  return apiFetch(urlDocumentos(profissionalId, `/${documentoId}/link`), {
    schema: arquivoLinkSchema,
  });
}
