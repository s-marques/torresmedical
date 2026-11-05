import {
  compraSchema,
  compraXmlPreviaSchema,
  type CreateCompraInput,
  type UpdateCompraInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { URL_PRODUTOS } from '../produtos-servicos/use-produtos';

export const URL_COMPRAS = '/api/compras-estoque/compras';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` (e o estoque em Produtos) é buscada de novo. */
function useMutationCompra<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<unknown>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_COMPRAS] });
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_PRODUTOS] });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_COMPRAS}${path}`, { method, body, schema: compraSchema });
}

export function useCriarCompra() {
  return useMutationCompra((dados: CreateCompraInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Compra registrada.',
  });
}

export function useEditarCompra(id: string) {
  return useMutationCompra((dados: UpdateCompraInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'Compra atualizada.',
  });
}

export function useExcluirCompra() {
  return useMutationCompra((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Compra excluída.',
  });
}

export function useCancelarCompra() {
  return useMutationCompra((id: string) => chamar(`/${id}/cancelar`, 'POST'), {
    sucesso: 'Compra cancelada.',
  });
}

/** "Visualizar Nota": lê o XML no servidor e devolve a prévia (nada é gravado). */
export function useImportarXmlCompra() {
  return useMutation({
    mutationFn: (xml: string) =>
      apiFetch(`${URL_COMPRAS}/importar-xml`, {
        method: 'POST',
        body: { xml },
        schema: compraXmlPreviaSchema,
      }),
    meta: META_FORMULARIO,
  });
}
