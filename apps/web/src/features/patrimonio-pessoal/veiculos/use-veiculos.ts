import {
  veiculoSchema,
  type CreateVeiculoInput,
  type Veiculo,
  type UpdateVeiculoInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { i18next } from '@/lib/i18n';

export const URL_VEICULOS = '/api/patrimonio-pessoal/veiculos';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationVeiculo<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<Veiculo>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_VEICULOS] });
      toast.success(i18next.t(sucesso));
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_VEICULOS}${path}`, { method, body, schema: veiculoSchema });
}

export function useCriarVeiculo() {
  return useMutationVeiculo((dados: CreateVeiculoInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'veiculos.sucesso.criado',
  });
}

export function useEditarVeiculo(id: string) {
  return useMutationVeiculo((dados: UpdateVeiculoInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'veiculos.sucesso.atualizado',
  });
}

export function useExcluirVeiculo() {
  return useMutationVeiculo((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'veiculos.sucesso.excluido',
  });
}
