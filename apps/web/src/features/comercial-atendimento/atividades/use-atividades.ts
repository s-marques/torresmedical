import {
  atividadeSchema,
  responsavelListaSchema,
  resumoAtividadesSchema,
  type AtividadeInput,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_ATIVIDADES = '/api/comercial-atendimento/atividades';

/** Tudo da tela fora do grid (resumo e listas de apoio) fica sob a mesma chave. */
const CHAVE = ['atividades'] as const;

export function useResponsaveisAtividades() {
  return useQuery({
    queryKey: [...CHAVE, 'responsaveis'],
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_ATIVIDADES}/responsaveis`, { schema: responsavelListaSchema, signal }),
  });
}

/** Cartões Total/Pendentes/Concluídas/Canceladas: seguem a busca e o tipo do grid. */
export function useResumoAtividades(filtros: { search?: string; tipo?: string }) {
  return useQuery({
    queryKey: [...CHAVE, 'resumo', filtros.search ?? '', filtros.tipo ?? ''],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_ATIVIDADES}/resumo`, {
        query: { search: filtros.search, tipo: filtros.tipo },
        schema: resumoAtividadesSchema,
        signal,
      }),
  });
}

/** Mutation da tela: recarrega grid, resumo e o quadro do Pipeline e mostra o toast. */
function useEscrita<V>(
  chamar: (variaveis: V) => Promise<unknown>,
  sucesso: string,
  formulario = false,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chamar,
    ...(formulario ? { meta: META_FORMULARIO } : {}),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_ATIVIDADES] }),
        queryClient.invalidateQueries({ queryKey: CHAVE }),
        // O Pipeline mostra a próxima ação de cada negócio.
        queryClient.invalidateQueries({ queryKey: ['pipeline'] }),
      ]);
      toast.success(sucesso);
    },
  });
}

const atividade = (path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) =>
  apiFetch(`${URL_ATIVIDADES}${path}`, { method, body, schema: atividadeSchema });

export function useCriarAtividade() {
  return useEscrita(
    (dados: AtividadeInput) => atividade('', 'POST', dados),
    'Atividade criada.',
    true,
  );
}

export function useEditarAtividade(id: string) {
  return useEscrita(
    (dados: AtividadeInput) => atividade(`/${id}`, 'PATCH', dados),
    'Atividade atualizada.',
    true,
  );
}

/**
 * "Concluir"/"Cancelar". Com `proxima`, agenda antes a próxima atividade do negócio (última
 * pendente de negócio aberto) e só então fecha esta.
 */
export function useFecharAtividade(acao: 'concluir' | 'cancelar') {
  return useEscrita(
    async ({ id, proxima }: { id: string; proxima?: AtividadeInput }) => {
      if (proxima) await atividade('', 'POST', proxima);
      return atividade(`/${id}/${acao}`, 'PATCH');
    },
    acao === 'concluir' ? 'Atividade concluída.' : 'Atividade cancelada.',
    true,
  );
}

export function useExcluirAtividade() {
  return useEscrita((id: string) => atividade(`/${id}`, 'DELETE'), 'Atividade excluída.');
}
