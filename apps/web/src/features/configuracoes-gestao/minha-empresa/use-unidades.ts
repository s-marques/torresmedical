import {
  unidadeSchema,
  type CreateUnidadeInput,
  type Unidade,
  type UpdateUnidadeInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_UNIDADES = '/api/configuracoes-gestao/unidades';

function useMutationUnidade<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<Unidade>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_UNIDADES] });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_UNIDADES}${path}`, { method, body, schema: unidadeSchema });
}

export function useCriarUnidade() {
  return useMutationUnidade((dados: CreateUnidadeInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Unidade cadastrada.',
  });
}

export function useEditarUnidade(id: string) {
  return useMutationUnidade((dados: UpdateUnidadeInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'Unidade atualizada.',
  });
}

export function useExcluirUnidade() {
  return useMutationUnidade((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Unidade excluída.',
  });
}
