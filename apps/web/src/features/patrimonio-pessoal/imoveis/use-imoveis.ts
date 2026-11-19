import {
  imovelSchema,
  type CreateImovelInput,
  type Imovel,
  type UpdateImovelInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { i18next } from '@/lib/i18n';

export const URL_IMOVEIS = '/api/patrimonio-pessoal/imoveis';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationImovel<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<Imovel>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_IMOVEIS] });
      toast.success(i18next.t(sucesso));
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_IMOVEIS}${path}`, { method, body, schema: imovelSchema });
}

export function useCriarImovel() {
  return useMutationImovel((dados: CreateImovelInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'imoveis.sucesso.criado',
  });
}

export function useEditarImovel(id: string) {
  return useMutationImovel((dados: UpdateImovelInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'imoveis.sucesso.atualizado',
  });
}

export function useExcluirImovel() {
  return useMutationImovel((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'imoveis.sucesso.excluido',
  });
}
