import {
  usuarioSchema,
  type CreateUsuarioInput,
  type ResetarSenhaUsuarioInput,
  type Usuario,
  type UpdateUsuarioInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_USUARIOS = '/api/configuracoes-gestao/usuarios';

function useMutationUsuario<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<Usuario>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_USUARIOS] });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH', body?: unknown) {
  return apiFetch(`${URL_USUARIOS}${path}`, { method, body, schema: usuarioSchema });
}

export function useCriarUsuario() {
  return useMutationUsuario((dados: CreateUsuarioInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Usuário cadastrado.',
  });
}

export function useEditarUsuario(id: string) {
  return useMutationUsuario((dados: UpdateUsuarioInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'Usuário atualizado.',
  });
}

export function useDesativarUsuario() {
  return useMutationUsuario(
    (usuario: Usuario) =>
      chamar(`/${usuario.id}`, 'PATCH', { ...paraEntrada(usuario), status: 'inativo' }),
    { sucesso: 'Usuário desativado.' },
  );
}

export function useResetarSenhaUsuario(id: string) {
  return useMutationUsuario(
    (dados: ResetarSenhaUsuarioInput) => chamar(`/${id}/resetar-senha`, 'PATCH', dados),
    { formulario: true, sucesso: 'Senha redefinida.' },
  );
}

/** Monta o corpo do `PATCH` (substitui todos os campos) a partir do registro atual. */
function paraEntrada(u: Usuario): UpdateUsuarioInput {
  return {
    nome: u.nome,
    email: u.email,
    telefone: u.telefone,
    cargo: u.cargo,
    perfilId: u.perfilId,
    verDadosSensiveis: u.verDadosSensiveis,
    status: u.ativo ? 'ativo' : 'inativo',
  };
}
