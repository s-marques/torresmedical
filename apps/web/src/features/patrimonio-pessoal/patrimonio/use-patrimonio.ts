import {
  bemSchema,
  resumoPatrimonioSchema,
  type Bem,
  type CreateBemInput,
  type UpdateBemInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { i18next } from '@/lib/i18n';

export const URL_PATRIMONIO = '/api/patrimonio-pessoal/patrimonio';
const CHAVE_RESUMO = ['patrimonio', 'resumo'] as const;

/** Cartões do topo: Valor Total, Impostos Pendentes e Alertas Próximos. */
export function useResumoPatrimonio() {
  return useQuery({
    queryKey: CHAVE_RESUMO,
    queryFn: () => apiFetch(`${URL_PATRIMONIO}/resumo`, { schema: resumoPatrimonioSchema }),
  });
}

/** Mutations da tela: ao concluir, a grid e os cartões são buscados de novo. */
function useMutationBem<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<Bem>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_PATRIMONIO] }),
        queryClient.invalidateQueries({ queryKey: CHAVE_RESUMO }),
      ]);
      toast.success(i18next.t(sucesso));
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_PATRIMONIO}${path}`, { method, body, schema: bemSchema });
}

export function useCriarBem() {
  return useMutationBem((dados: CreateBemInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'patrimonio.sucesso.criado',
  });
}

export function useEditarBem(id: string) {
  return useMutationBem((dados: UpdateBemInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'patrimonio.sucesso.atualizado',
  });
}

export function useExcluirBem() {
  return useMutationBem((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'patrimonio.sucesso.excluido',
  });
}
