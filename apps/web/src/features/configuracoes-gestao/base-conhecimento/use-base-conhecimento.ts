import {
  documentoConhecimentoPageSchema,
  documentoConhecimentoSchema,
  type CreateDocumentoConhecimentoInput,
  type DocumentoConhecimento,
  type DocumentoConhecimentoCategoria,
  type UpdateDocumentoConhecimentoInput,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_BASE_CONHECIMENTO = '/api/configuracoes-gestao/base-conhecimento';

const CHAVE = ['base-conhecimento'] as const;

export interface FiltrosBaseConhecimento {
  search: string;
  profissionalId: string | null;
  categoria: DocumentoConhecimentoCategoria | null;
}

/**
 * A tela mostra os documentos em cards, sem paginação (como no sistema atual): busca a primeira
 * página no tamanho máximo, filtrada por busca, profissional e categoria.
 */
export function useDocumentosConhecimento({
  search,
  profissionalId,
  categoria,
}: FiltrosBaseConhecimento) {
  return useQuery({
    queryKey: [...CHAVE, search, profissionalId, categoria],
    queryFn: ({ signal }) =>
      apiFetch(URL_BASE_CONHECIMENTO, {
        query: {
          page: 1,
          pageSize: 100,
          sort: 'titulo:asc',
          search: search || undefined,
          profissionalId: profissionalId ?? undefined,
          categoria: categoria ?? undefined,
        },
        schema: documentoConhecimentoPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

function useMutationDocumento<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<DocumentoConhecimento>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: META_FORMULARIO,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  });
}

function chamar(path: string, method: 'POST' | 'PATCH', body: unknown) {
  return apiFetch(`${URL_BASE_CONHECIMENTO}${path}`, {
    method,
    body,
    schema: documentoConhecimentoSchema,
  });
}

export function useCriarDocumento() {
  return useMutationDocumento((dados: CreateDocumentoConhecimentoInput) =>
    chamar('', 'POST', dados),
  );
}

export function useAlterarDocumento(id: string) {
  return useMutationDocumento((dados: UpdateDocumentoConhecimentoInput) =>
    chamar(`/${id}`, 'PATCH', dados),
  );
}
