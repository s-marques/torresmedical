import {
  origemClienteSchema,
  type CreateOrigemClienteInput,
  type MoverOrigemClienteInput,
  type OrigemCliente,
  type UpdateOrigemClienteInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_ORIGENS_CLIENTE = '/api/comercial-atendimento/origens-cliente';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationOrigem<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<OrigemCliente>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: (o: OrigemCliente) => string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async (origem) => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_ORIGENS_CLIENTE] });
      if (sucesso) toast.success(sucesso(origem));
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_ORIGENS_CLIENTE}${path}`, { method, body, schema: origemClienteSchema });
}

export function useCriarOrigem() {
  return useMutationOrigem((dados: CreateOrigemClienteInput) => chamar('', 'POST', dados), {
    formulario: true,
  });
}

export function useRenomearOrigem(id: string) {
  return useMutationOrigem((dados: UpdateOrigemClienteInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
  });
}

export function useAlterarAtivaOrigem() {
  return useMutationOrigem(
    ({ id, ativa }: { id: string; ativa: boolean }) => chamar(`/${id}/ativa`, 'PATCH', { ativa }),
    { sucesso: (origem) => (origem.ativa ? 'Origem ativada.' : 'Origem desativada.') },
  );
}

export function useMoverOrigem() {
  return useMutationOrigem(
    ({ id, direcao }: { id: string } & MoverOrigemClienteInput) =>
      chamar(`/${id}/mover`, 'PATCH', { direcao }),
    {},
  );
}

export function useExcluirOrigem() {
  return useMutationOrigem((id: string) => chamar(`/${id}`, 'DELETE'), {});
}
