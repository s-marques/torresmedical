import {
  categoriaSchema,
  type Categoria,
  type CreateCategoriaInput,
  type UpdateCategoriaInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_CATEGORIAS = '/api/compras-estoque/categorias';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationCategoria<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<Categoria>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_CATEGORIAS] });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_CATEGORIAS}${path}`, { method, body, schema: categoriaSchema });
}

export function useCriarCategoria() {
  return useMutationCategoria((dados: CreateCategoriaInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Categoria cadastrada.',
  });
}

export function useEditarCategoria(id: string) {
  return useMutationCategoria((dados: UpdateCategoriaInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'Categoria atualizada.',
  });
}

export function useExcluirCategoria() {
  return useMutationCategoria((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Categoria excluída.',
  });
}
