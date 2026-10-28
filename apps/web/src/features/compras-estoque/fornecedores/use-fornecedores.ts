import {
  fornecedorSchema,
  type CreateFornecedorInput,
  type Fornecedor,
  type UpdateFornecedorInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_FORNECEDORES = '/api/compras-estoque/fornecedores';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationFornecedor<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<Fornecedor>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_FORNECEDORES] });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_FORNECEDORES}${path}`, { method, body, schema: fornecedorSchema });
}

export function useCriarFornecedor() {
  return useMutationFornecedor((dados: CreateFornecedorInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Fornecedor cadastrado.',
  });
}

export function useEditarFornecedor(id: string) {
  return useMutationFornecedor((dados: UpdateFornecedorInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'Fornecedor atualizado.',
  });
}

export function useExcluirFornecedor() {
  return useMutationFornecedor((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Fornecedor excluído.',
  });
}
