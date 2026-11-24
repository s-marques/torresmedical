import {
  negocioVinculavelPageSchema,
  negocioVinculoSchema,
  profissionalHistoricoSchema,
  type HistoricoTipo,
  type NegocioVinculo,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { i18next } from '@/lib/i18n';

const CHAVE = 'historico-profissional';
const URL_PIPELINE = '/api/comercial-atendimento/pipeline';

/** Linha do tempo do profissional, em ordem cronológica, com filtro opcional por tipo. */
export function useHistoricoProfissional(profissionalId: string, tipo: HistoricoTipo | null) {
  return useQuery({
    queryKey: [CHAVE, profissionalId, tipo],
    queryFn: ({ signal }) =>
      apiFetch(`/api/gestao-profissionais/profissionais/${profissionalId}/historico`, {
        query: { ...(tipo ? { tipo } : {}) },
        schema: profissionalHistoricoSchema,
        signal,
      }),
  });
}

/** Negócios do CRM que ainda podem ser ligados a um profissional ("Vincular negócio"). */
export function useNegociosVinculaveis(search: string) {
  return useQuery({
    queryKey: ['negocios-vinculaveis', search],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PIPELINE}/negocios/vinculaveis`, {
        query: { pageSize: 20, ...(search ? { search } : {}) },
        schema: negocioVinculavelPageSchema,
        signal,
      }),
  });
}

/** Liga o negócio ao profissional; a linha do tempo passa a mostrar o histórico do CRM. */
export function useVincularNegocio(profissionalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (negocioId: string): Promise<NegocioVinculo> =>
      apiFetch(`${URL_PIPELINE}/negocios/${negocioId}/profissional`, {
        method: 'PATCH',
        body: { profissionalId },
        schema: negocioVinculoSchema,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CHAVE, profissionalId] }),
        queryClient.invalidateQueries({ queryKey: ['negocios-vinculaveis'] }),
      ]);
      toast.success(i18next.t('historicoProfissional.mensagens.vinculado'));
    },
  });
}
