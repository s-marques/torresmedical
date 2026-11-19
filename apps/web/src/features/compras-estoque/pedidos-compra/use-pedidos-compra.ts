import {
  pedidoCompraSchema,
  type CreatePedidoCompraInput,
  type UpdatePedidoCompraInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_PEDIDOS_COMPRA = '/api/compras-estoque/pedidos-compra';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationPedido<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<unknown>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_PEDIDOS_COMPRA] });
      toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_PEDIDOS_COMPRA}${path}`, { method, body, schema: pedidoCompraSchema });
}

export function useCriarPedidoCompra() {
  return useMutationPedido((dados: CreatePedidoCompraInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Pedido de compra criado.',
  });
}

export function useEditarPedidoCompra(id: string) {
  return useMutationPedido((dados: UpdatePedidoCompraInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'Pedido de compra atualizado.',
  });
}

export function useReceberPedidoCompra() {
  return useMutationPedido((id: string) => chamar(`/${id}/receber`, 'POST'), {
    sucesso: 'Pedido marcado como recebido.',
  });
}

export function useCancelarPedidoCompra() {
  return useMutationPedido((id: string) => chamar(`/${id}/cancelar`, 'POST'), {
    sucesso: 'Pedido cancelado.',
  });
}

export function useExcluirPedidoCompra() {
  return useMutationPedido((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Pedido excluído.',
  });
}
