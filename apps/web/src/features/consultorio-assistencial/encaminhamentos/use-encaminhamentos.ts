import {
  encaminhamentoProfissionaisSchema,
  encaminhamentoSchema,
  type CreateEncaminhamentoInput,
  type Encaminhamento,
  type UpdateEncaminhamentoInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { i18next } from '@/lib/i18n';

export const URL_ENCAMINHAMENTOS = '/api/consultorio-assistencial/encaminhamentos';
export const URL_RELATORIO_ENCAMINHAMENTOS = `${URL_ENCAMINHAMENTOS}/relatorio`;

/** Selects de origem e destino: só profissionais com contrato que permite indicação. */
export function useProfissionaisEncaminhamento() {
  return useQuery({
    queryKey: ['encaminhamentos', 'profissionais'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_ENCAMINHAMENTOS}/profissionais`, {
        schema: encaminhamentoProfissionaisSchema,
        signal,
      }),
  });
}

/** Mutations da tela: ao concluir, a lista e o relatório do `DataGrid` são buscados de novo. */
function useMutationEncaminhamento<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<Encaminhamento>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_ENCAMINHAMENTOS] }),
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_RELATORIO_ENCAMINHAMENTOS] }),
      ]);
      toast.success(i18next.t(sucesso));
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_ENCAMINHAMENTOS}${path}`, { method, body, schema: encaminhamentoSchema });
}

export function useRegistrarEncaminhamento() {
  return useMutationEncaminhamento(
    (dados: CreateEncaminhamentoInput) => chamar('', 'POST', dados),
    {
      formulario: true,
      sucesso: 'encaminhamentos.sucesso.criado',
    },
  );
}

export function useEditarEncaminhamento(id: string) {
  return useMutationEncaminhamento(
    (dados: UpdateEncaminhamentoInput) => chamar(`/${id}`, 'PATCH', dados),
    { formulario: true, sucesso: 'encaminhamentos.sucesso.atualizado' },
  );
}

export function useExcluirEncaminhamento() {
  return useMutationEncaminhamento((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'encaminhamentos.sucesso.excluido',
  });
}
