import { aiGrowthAnaliseSchema, aiGrowthPainelSchema } from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { i18next } from '@/lib/i18n';
import { apiFetch } from '@/lib/api/client';

export const URL_AI_GROWTH = '/api/configuracoes-gestao/ai-growth';
const CHAVE = ['ai-growth'] as const;
const INTERVALO_ANALISE_MS = 3000;

/** Painel de insights. Enquanto há análise em andamento, consulta de novo a cada 3 s. */
export function usePainelAiGrowth() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: ({ signal }) => apiFetch(URL_AI_GROWTH, { schema: aiGrowthPainelSchema, signal }),
    refetchInterval: (query) => (query.state.data?.emAndamento ? INTERVALO_ANALISE_MS : false),
  });
}

/** "Analisar Agora": o servidor responde 202 e processa em segundo plano. */
export function useAnalisarAgora() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`${URL_AI_GROWTH}/analisar`, { method: 'POST', schema: aiGrowthAnaliseSchema }),
    onSuccess: async () => {
      toast.success(i18next.t('aiGrowth.analiseIniciada'));
      await queryClient.invalidateQueries({ queryKey: CHAVE });
    },
  });
}
