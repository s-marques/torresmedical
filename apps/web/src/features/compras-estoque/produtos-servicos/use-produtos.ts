import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  produtoSchema,
  unidadeMedidaSchema,
  type CreateProdutoInput,
  type CreateUnidadeMedidaInput,
  type Produto,
  type UpdateProdutoInput,
} from '@torres/shared';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { buscarLookup } from '@/lib/api/lookups';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_PRODUTOS = '/api/compras-estoque/produtos';
export const URL_UNIDADES_MEDIDA = '/api/compras-estoque/unidades-medida';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationProduto<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<Produto>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_PRODUTOS] });
      await queryClient.invalidateQueries({ queryKey: ['lookups', 'produtos'] });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_PRODUTOS}${path}`, { method, body, schema: produtoSchema });
}

export function useCriarProduto() {
  return useMutationProduto((dados: CreateProdutoInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Produto cadastrado.',
  });
}

export function useEditarProduto(id: string) {
  return useMutationProduto((dados: UpdateProdutoInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'Produto atualizado.',
  });
}

export function useExcluirProduto() {
  return useMutationProduto((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Produto excluído.',
  });
}

/** Unidades de medida já cadastradas (lookup), para a lista do modal "Unidades de Medida". */
export function useUnidadesMedida() {
  return useQuery({
    queryKey: ['lookups', 'unidades-medida', 'lista-modal'],
    queryFn: ({ signal }) => buscarLookup('unidades-medida', { signal }),
    placeholderData: keepPreviousData,
  });
}

/** Incluir unidade: atualiza a lista do modal e os combos de Unidade de Medida. */
export function useIncluirUnidadeMedida() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: CreateUnidadeMedidaInput) =>
      apiFetch(URL_UNIDADES_MEDIDA, { method: 'POST', body: dados, schema: unidadeMedidaSchema }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lookups', 'unidades-medida'] });
      toast.success('Unidade incluída.');
    },
  });
}
