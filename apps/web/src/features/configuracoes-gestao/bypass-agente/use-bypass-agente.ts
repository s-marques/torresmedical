import {
  bypassAgenteSchema,
  type BypassAgente,
  type CreateBypassAgenteInput,
  type UpdateBypassAgenteInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_BYPASS_AGENTE = '/api/configuracoes-gestao/bypass-agente';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationBypass<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<BypassAgente>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: (b: BypassAgente) => string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async (registro) => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_BYPASS_AGENTE] });
      if (sucesso) toast.success(sucesso(registro));
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_BYPASS_AGENTE}${path}`, { method, body, schema: bypassAgenteSchema });
}

export function useAdicionarBypass() {
  return useMutationBypass((dados: CreateBypassAgenteInput) => chamar('', 'POST', dados), {
    formulario: true,
  });
}

export function useAlterarBypass(id: string) {
  return useMutationBypass((dados: UpdateBypassAgenteInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
  });
}

export function useAlterarStatusBypass() {
  return useMutationBypass(
    ({ id, ativo }: { id: string; ativo: boolean }) => chamar(`/${id}/status`, 'PATCH', { ativo }),
    { sucesso: (b) => (b.ativo ? 'Bypass ativado.' : 'Bypass desativado.') },
  );
}

export function useExcluirBypass() {
  return useMutationBypass((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: () => 'Telefone removido do bypass.',
  });
}
