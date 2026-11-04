import {
  comissaoSchema,
  type Comissao,
  type CreateComissaoInput,
  type UpdateComissaoInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { URL_FUNCIONARIOS } from './use-funcionarios';

export function urlComissoes(funcionarioId: string): string {
  return `${URL_FUNCIONARIOS}/${funcionarioId}/comissoes`;
}

function useMutationComissao<TVariaveis>(
  funcionarioId: string,
  mutationFn: (variaveis: TVariaveis) => Promise<Comissao>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['data-grid', urlComissoes(funcionarioId)],
      });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(url: string, path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${url}${path}`, { method, body, schema: comissaoSchema });
}

export function useCriarComissao(funcionarioId: string) {
  const url = urlComissoes(funcionarioId);
  return useMutationComissao(
    funcionarioId,
    (dados: CreateComissaoInput) => chamar(url, '', 'POST', dados),
    { formulario: true, sucesso: 'Comissão lançada.' },
  );
}

export function useEditarComissao(funcionarioId: string, id: string) {
  const url = urlComissoes(funcionarioId);
  return useMutationComissao(
    funcionarioId,
    (dados: UpdateComissaoInput) => chamar(url, `/${id}`, 'PATCH', dados),
    { formulario: true, sucesso: 'Comissão atualizada.' },
  );
}

export function useExcluirComissao(funcionarioId: string) {
  const url = urlComissoes(funcionarioId);
  return useMutationComissao(funcionarioId, (id: string) => chamar(url, `/${id}`, 'DELETE'), {
    sucesso: 'Comissão excluída.',
  });
}
