import {
  alertasEstoqueSchema,
  movimentacaoEstoqueSchema,
  resumoEstoqueSchema,
  type AjusteEstoqueInput,
  type EntradaEstoqueInput,
  type SaidaEstoqueInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { URL_PRODUTOS } from '../produtos-servicos/use-produtos';

export const URL_ESTOQUE = '/api/compras-estoque/estoque';
export const URL_POSICAO = `${URL_ESTOQUE}/posicao`;
export const URL_MOVIMENTACOES = `${URL_ESTOQUE}/movimentacoes`;
export const URL_SUGESTAO = `${URL_ESTOQUE}/sugestao`;

const CHAVE_ESTOQUE = ['estoque'] as const;

/** Cards do topo. */
export function useResumoEstoque() {
  return useQuery({
    queryKey: [...CHAVE_ESTOQUE, 'resumo'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_ESTOQUE}/resumo`, { schema: resumoEstoqueSchema, signal }),
  });
}

/** Aba Alertas. */
export function useAlertasEstoque() {
  return useQuery({
    queryKey: [...CHAVE_ESTOQUE, 'alertas'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_ESTOQUE}/alertas`, { schema: alertasEstoqueSchema, signal }),
  });
}

/** Ao registrar, cards, alertas, os grids da tela e o estoque em Produtos são buscados de novo. */
function useMovimentar<TDados>(caminho: string, sucesso: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: TDados) =>
      apiFetch(`${URL_ESTOQUE}/${caminho}`, {
        method: 'POST',
        body: dados,
        schema: movimentacaoEstoqueSchema,
      }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CHAVE_ESTOQUE }),
        ...[URL_POSICAO, URL_MOVIMENTACOES, URL_SUGESTAO, URL_PRODUTOS].map((url) =>
          queryClient.invalidateQueries({ queryKey: ['data-grid', url] }),
        ),
      ]);
      toast.success(sucesso);
    },
  });
}

export function useRegistrarEntrada() {
  return useMovimentar<EntradaEstoqueInput>('entradas', 'Entrada registrada.');
}

export function useRegistrarSaida() {
  return useMovimentar<SaidaEstoqueInput>('saidas', 'Saída registrada.');
}

export function useAjustarEstoque() {
  return useMovimentar<AjusteEstoqueInput>('ajustes', 'Estoque ajustado.');
}
