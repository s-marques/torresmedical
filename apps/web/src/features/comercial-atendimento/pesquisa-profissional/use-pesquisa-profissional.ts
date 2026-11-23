import {
  pesquisaProfissionalConfigSchema,
  pesquisaProfissionalPublicaSchema,
  resumoPesquisaProfissionalSchema,
  type PesquisaProfissionalConfigInput,
  type RespostaPesquisaProfissionalInput,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { i18next } from '@/lib/i18n';

export const URL_PESQUISA_PROFISSIONAL = '/api/comercial-atendimento/pesquisa-profissional';
export const URL_PESQUISA_PROFISSIONAL_PUBLICA = '/api/pesquisa-profissional-publica';

const CHAVE = ['pesquisa-profissional'] as const;

/** Período aplicado ("Carregar") e profissional escolhido: valem para Resultados e Respostas. */
export interface FiltroPesquisaProfissional {
  de: string;
  ate: string;
  profissionalId?: string;
}

/** Cartões e médias por categoria do período (o mesmo recorte da lista de Respostas). */
export function useResumoPesquisaProfissional(filtro: FiltroPesquisaProfissional) {
  return useQuery({
    queryKey: [...CHAVE, 'resumo', filtro.de, filtro.ate, filtro.profissionalId ?? null],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PESQUISA_PROFISSIONAL}/resumo`, {
        query: { ...filtro },
        schema: resumoPesquisaProfissionalSchema,
        signal,
      }),
  });
}

/** Recarrega os resultados e a lista de Respostas ("Carregar"). */
export function useRecarregarPesquisaProfissional() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: CHAVE }),
      queryClient.invalidateQueries({ queryKey: ['data-grid', URL_PESQUISA_PROFISSIONAL] }),
    ]);
}

export function useConfigPesquisaProfissional() {
  return useQuery({
    queryKey: [...CHAVE, 'configuracao'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PESQUISA_PROFISSIONAL}/configuracao`, {
        schema: pesquisaProfissionalConfigSchema,
        signal,
      }),
  });
}

export function useSalvarConfigPesquisaProfissional() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: META_FORMULARIO,
    mutationFn: (dados: PesquisaProfissionalConfigInput) =>
      apiFetch(`${URL_PESQUISA_PROFISSIONAL}/configuracao`, {
        method: 'PUT',
        body: dados,
        schema: pesquisaProfissionalConfigSchema,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...CHAVE, 'configuracao'] });
      toast.success(i18next.t('pesquisaProfissional.configuracao.sucesso'));
    },
  });
}

// ---------- Página pública de resposta (link com token, sem login) ----------

export function usePesquisaPublica(token: string) {
  return useQuery({
    queryKey: [...CHAVE, 'publica', token],
    enabled: token !== '',
    retry: false,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PESQUISA_PROFISSIONAL_PUBLICA}/${encodeURIComponent(token)}`, {
        schema: pesquisaProfissionalPublicaSchema,
        signal,
      }),
  });
}

export function useResponderPesquisa(token: string) {
  return useMutation({
    meta: META_FORMULARIO,
    mutationFn: (dados: RespostaPesquisaProfissionalInput) =>
      apiFetch(`${URL_PESQUISA_PROFISSIONAL_PUBLICA}/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: dados,
      }),
  });
}
