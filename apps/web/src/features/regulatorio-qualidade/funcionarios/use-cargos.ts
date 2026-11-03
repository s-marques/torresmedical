import {
  cargoSchema,
  type Cargo,
  type CreateCargoInput,
  type UpdateCargoInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_CARGOS = '/api/regulatorio-qualidade/cargos';

function useMutationCargo<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<Cargo>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_CARGOS] });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_CARGOS}${path}`, { method, body, schema: cargoSchema });
}

export function useCriarCargo() {
  return useMutationCargo((dados: CreateCargoInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Cargo cadastrado.',
  });
}

export function useEditarCargo(id: string) {
  return useMutationCargo((dados: UpdateCargoInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'Cargo atualizado.',
  });
}

export function useExcluirCargo() {
  return useMutationCargo((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Cargo excluído.',
  });
}
