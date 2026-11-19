import {
  prestadorSchema,
  type CreatePrestadorInput,
  type Prestador,
  type UpdatePrestadorInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_PRESTADORES = '/api/consultorio-assistencial/prestadores';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationPrestador<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<Prestador>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_PRESTADORES] });
      toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_PRESTADORES}${path}`, { method, body, schema: prestadorSchema });
}

export function useCriarPrestador() {
  return useMutationPrestador((dados: CreatePrestadorInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Prestador cadastrado.',
  });
}

export function useEditarPrestador(id: string) {
  return useMutationPrestador((dados: UpdatePrestadorInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'Prestador atualizado.',
  });
}

export function useExcluirPrestador() {
  return useMutationPrestador((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Prestador excluído.',
  });
}
