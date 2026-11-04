import {
  catalogoVendaPageSchema,
  totaisConsultasRealizadasSchema,
  vendaSchema,
  type CriarVendaInput,
  type TotaisConsultasRealizadasQuery,
  type VendaOrigem,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_VENDAS = '/api/comercial-atendimento/vendas';
export const URL_CONSULTAS = `${URL_VENDAS}/consultas`;

/** Itens por consulta do catálogo do PDV; acima disso o usuário refina a busca. */
export const CATALOGO_TAMANHO = 20;

/** Finalizar Venda: ao concluir, a listagem do `DataGrid` é buscada de novo. */
export function useCriarVenda() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: CriarVendaInput) =>
      apiFetch(URL_VENDAS, { method: 'POST', body: dados, schema: vendaSchema }),
    meta: META_FORMULARIO,
    onSuccess: async (venda) => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_VENDAS] });
      toast.success(`Venda #${venda.numero} finalizada!`);
    },
  });
}

/** Produtos/serviços (busca) ou protocolos (botão Protocolo) que podem entrar na venda. */
export function useCatalogoVenda(tipo: VendaOrigem, search: string, habilitado = true) {
  return useQuery({
    queryKey: ['vendas', 'catalogo', tipo, search],
    enabled: habilitado,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_VENDAS}/catalogo`, {
        query: { tipo, search: search || undefined, pageSize: CATALOGO_TAMANHO },
        schema: catalogoVendaPageSchema,
        signal,
      }),
  });
}

/** Cards Total Consultas / Valor Total / Recebido, com o mesmo período e filtro do grid. */
export function useTotaisConsultas(filtros: TotaisConsultasRealizadasQuery) {
  return useQuery({
    queryKey: ['vendas', 'consultas-totais', filtros],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_CONSULTAS}/totais`, {
        query: { ...filtros },
        schema: totaisConsultasRealizadasSchema,
        signal,
      }),
  });
}
