import {
  formaPagamentoSchema,
  type CreateFormaPagamentoInput,
  type FormaPagamento,
  type UpdateFormaPagamentoInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_FORMAS_PAGAMENTO = '/api/financeiro/formas-pagamento';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationForma<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<FormaPagamento>,
  {
    formulario = false,
    sucesso,
  }: { formulario?: boolean; sucesso?: (f: FormaPagamento) => string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async (forma) => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_FORMAS_PAGAMENTO] });
      if (sucesso) toast.success(sucesso(forma));
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_FORMAS_PAGAMENTO}${path}`, { method, body, schema: formaPagamentoSchema });
}

export function useCriarForma() {
  return useMutationForma((dados: CreateFormaPagamentoInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: (forma) => `${forma.nome} criada!`,
  });
}

export function useEditarForma(id: string) {
  return useMutationForma((dados: UpdateFormaPagamentoInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: (forma) => `${forma.nome} atualizada!`,
  });
}

/** Ativar/Desativar: só muda o status, sem confirmação (confirmado pelo dev na issue #49). */
export function useAlterarAtivaForma() {
  return useMutationForma(
    ({ id, ativo }: { id: string; ativo: boolean }) => chamar(`/${id}`, 'PATCH', { ativo }),
    { sucesso: (forma) => `${forma.nome} ${forma.ativo ? 'ativada' : 'desativada'}!` },
  );
}

export function useExcluirForma() {
  return useMutationForma((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: (forma) => `${forma.nome} excluída!`,
  });
}
