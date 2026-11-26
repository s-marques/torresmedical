import {
  motivoCancelamentoSchema,
  type CreateMotivoCancelamentoInput,
  type MotivoCancelamento,
  type UpdateMotivoCancelamentoInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { i18next } from '@/lib/i18n';

export const URL_MOTIVOS_CANCELAMENTO = '/api/configuracoes-gestao/motivos-cancelamento';

/**
 * Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo e a lista de motivos
 * dos modais de cancelamento também.
 */
function useMutationMotivo<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<MotivoCancelamento>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_MOTIVOS_CANCELAMENTO] });
      await queryClient.invalidateQueries({ queryKey: ['cancelamentos', 'motivos'] });
      toast.success(i18next.t(sucesso));
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_MOTIVOS_CANCELAMENTO}${path}`, {
    method,
    body,
    schema: motivoCancelamentoSchema,
  });
}

export function useCriarMotivo() {
  return useMutationMotivo((dados: CreateMotivoCancelamentoInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'motivosCancelamento.sucesso.criado',
  });
}

export function useEditarMotivo(id: string) {
  return useMutationMotivo(
    (dados: UpdateMotivoCancelamentoInput) => chamar(`/${id}`, 'PATCH', dados),
    { formulario: true, sucesso: 'motivosCancelamento.sucesso.atualizado' },
  );
}

export function useExcluirMotivo() {
  return useMutationMotivo((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'motivosCancelamento.sucesso.excluido',
  });
}
