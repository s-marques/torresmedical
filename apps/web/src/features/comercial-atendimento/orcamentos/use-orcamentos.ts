import {
  catalogoOrcamentoPageSchema,
  orcamentoSchema,
  type CriarOrcamentoInput,
  type OrcamentoOrigem,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_ORCAMENTOS = '/api/comercial-atendimento/orcamentos';

/** Itens por consulta do catálogo; acima disso o usuário refina a busca. */
export const CATALOGO_TAMANHO = 50;

/** Criar Orçamento: ao concluir, a listagem do `DataGrid` é buscada de novo. */
export function useCriarOrcamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: CriarOrcamentoInput) =>
      apiFetch(URL_ORCAMENTOS, { method: 'POST', body: dados, schema: orcamentoSchema }),
    meta: META_FORMULARIO,
    onSuccess: async (orcamento) => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_ORCAMENTOS] });
      toast.success(`Orçamento #${orcamento.numero} criado!`);
    },
  });
}

/** Serviços, protocolos ou protocolos mãe que podem entrar no orçamento (abas do modal). */
export function useCatalogoOrcamento(tipo: OrcamentoOrigem, search: string) {
  return useQuery({
    queryKey: ['orcamentos', 'catalogo', tipo, search],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_ORCAMENTOS}/catalogo`, {
        query: { tipo, search: search || undefined, pageSize: CATALOGO_TAMANHO },
        schema: catalogoOrcamentoPageSchema,
        signal,
      }),
  });
}
