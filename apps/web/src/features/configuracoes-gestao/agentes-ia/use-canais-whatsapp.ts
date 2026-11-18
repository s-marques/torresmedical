import {
  canalWhatsappPageSchema,
  canalWhatsappSchema,
  usuariosCanalWhatsappSchema,
  type CanalWhatsapp,
  type CreateCanalWhatsappInput,
  type DefinirUsuariosCanalWhatsappInput,
  type UpdateCanalWhatsappInput,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_CANAIS_WHATSAPP = '/api/configuracoes-gestao/canais-whatsapp';

const CHAVE = ['canais-whatsapp'] as const;
const CHAVE_USUARIOS = ['canais-whatsapp', 'usuarios-disponiveis'] as const;

/** A tela mostra os canais em cards, sem paginação (como no sistema atual): primeira página no tamanho máximo. */
export function useCanaisWhatsapp() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: ({ signal }) =>
      apiFetch(URL_CANAIS_WHATSAPP, {
        query: { page: 1, pageSize: 100, sort: 'nome:asc' },
        schema: canalWhatsappPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

/** Usuários ativos para marcar o acesso aos canais (modais "Novo Canal" e "Usuários"). */
export function useUsuariosDisponiveis() {
  return useQuery({
    queryKey: CHAVE_USUARIOS,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_CANAIS_WHATSAPP}/usuarios-disponiveis`, {
        schema: usuariosCanalWhatsappSchema,
        signal,
      }),
  });
}

function useMutationCanal<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<CanalWhatsapp>,
  formulario: boolean,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_CANAIS_WHATSAPP}${path}`, { method, body, schema: canalWhatsappSchema });
}

export function useCriarCanal() {
  return useMutationCanal((dados: CreateCanalWhatsappInput) => chamar('', 'POST', dados), true);
}

export function useAlterarCanal(id: string) {
  return useMutationCanal(
    (dados: UpdateCanalWhatsappInput) => chamar(`/${id}`, 'PATCH', dados),
    true,
  );
}

export function useDefinirUsuariosCanal(id: string) {
  return useMutationCanal(
    (dados: DefinirUsuariosCanalWhatsappInput) => chamar(`/${id}/usuarios`, 'PUT', dados),
    false,
  );
}

export function useExcluirCanal() {
  return useMutationCanal((id: string) => chamar(`/${id}`, 'DELETE'), false);
}
