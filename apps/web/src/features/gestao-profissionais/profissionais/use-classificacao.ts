import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  classificacaoHistoricoPageSchema,
  profissionalSchema,
  type Profissional,
} from '@torres/shared';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { i18next } from '@/lib/i18n';
import { URL_PROFISSIONAIS } from './use-profissionais';

const CHAVE = 'classificacao-profissional';
/** Quantas mudanças o detalhe mostra de uma vez. */
export const TAMANHO_HISTORICO = 10;

/** Histórico de mudanças de classificação do profissional (a mais recente primeiro). */
export function useHistoricoClassificacao(profissionalId: string, pagina: number) {
  return useQuery({
    queryKey: [CHAVE, profissionalId, pagina],
    queryFn: ({ signal }) =>
      apiFetch(
        `${URL_PROFISSIONAIS}/${profissionalId}/classificacoes?page=${pagina}&pageSize=${TAMANHO_HISTORICO}`,
        { schema: classificacaoHistoricoPageSchema, signal },
      ),
  });
}

/** Marca ou desmarca "Estratégico"; a lista e o histórico se atualizam. */
export function useDefinirEstrategico(profissionalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (estrategico: boolean): Promise<Profissional> =>
      apiFetch(`${URL_PROFISSIONAIS}/${profissionalId}/estrategico`, {
        method: 'PUT',
        body: { estrategico },
        schema: profissionalSchema,
      }),
    onSuccess: async (_profissional, estrategico) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CHAVE, profissionalId] }),
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_PROFISSIONAIS] }),
      ]);
      toast.success(
        i18next.t(
          estrategico ? 'classificacao.mensagens.marcado' : 'classificacao.mensagens.desmarcado',
        ),
      );
    },
  });
}
