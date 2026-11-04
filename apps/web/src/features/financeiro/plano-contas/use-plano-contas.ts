import {
  planoContaListaSchema,
  planoContaSchema,
  type CreatePlanoContaInput,
  type PlanoConta,
  type PlanoContaTipo,
  type UpdatePlanoContaInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_PLANO_CONTAS = '/api/financeiro/plano-contas';
const CHAVE = ['plano-contas'] as const;

export interface FiltrosPlanoContas {
  search: string;
  tipo?: PlanoContaTipo;
}

/** A listagem inteira (a árvore não é paginada). `placeholderData` evita piscar ao filtrar. */
export function usePlanoContas({ search, tipo }: FiltrosPlanoContas) {
  return useQuery({
    queryKey: [...CHAVE, { search, tipo }],
    queryFn: ({ signal }) =>
      apiFetch(URL_PLANO_CONTAS, {
        query: { search: search || undefined, tipo },
        schema: planoContaListaSchema,
        signal,
      }),
    placeholderData: (anterior) => anterior,
  });
}

function useMutationConta<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<PlanoConta>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: (c: PlanoConta) => string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async (conta) => {
      await queryClient.invalidateQueries({ queryKey: CHAVE });
      if (sucesso) toast.success(sucesso(conta));
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_PLANO_CONTAS}${path}`, { method, body, schema: planoContaSchema });
}

export function useCriarConta() {
  return useMutationConta((dados: CreatePlanoContaInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: (conta) => `Conta ${conta.codigo} criada!`,
  });
}

export function useEditarConta(id: string) {
  return useMutationConta((dados: UpdatePlanoContaInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: (conta) => `Conta ${conta.codigo} atualizada!`,
  });
}

/** Interruptor da linha: desativa e, ao clicar de novo, ativa. Sem confirmação (confirmado pelo dev na issue #51). */
export function useAlterarAtivaConta() {
  return useMutationConta(
    ({ id, ativo }: { id: string; ativo: boolean }) => chamar(`/${id}`, 'PATCH', { ativo }),
    { sucesso: (conta) => `Conta ${conta.codigo} ${conta.ativo ? 'ativada' : 'desativada'}!` },
  );
}

export function useExcluirConta() {
  return useMutationConta((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: (conta) => `Conta ${conta.codigo.split('#')[0]} excluída!`,
  });
}
