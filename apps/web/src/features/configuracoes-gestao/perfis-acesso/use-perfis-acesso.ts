import {
  perfilSchema,
  type CreatePerfilInput,
  type Perfil,
  type UpdatePerfilInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_PERFIS_ACESSO = '/api/configuracoes-gestao/perfis-acesso';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationPerfil<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<Perfil>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_PERFIS_ACESSO] });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_PERFIS_ACESSO}${path}`, { method, body, schema: perfilSchema });
}

export function useCriarPerfil() {
  return useMutationPerfil((dados: CreatePerfilInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Perfil cadastrado.',
  });
}

export function useEditarPerfil(id: string) {
  return useMutationPerfil((dados: UpdatePerfilInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'Perfil atualizado.',
  });
}

export function useExcluirPerfil() {
  return useMutationPerfil((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Perfil excluído.',
  });
}
