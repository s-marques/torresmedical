import {
  painelInadimplenciaSchema,
  reguaCobrancaSchema,
  reguaMarcoSchema,
  type ReguaMarco,
  type UpdateReguaMarcoInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { i18next } from '@/lib/i18n';

export const URL_INADIMPLENCIA = '/api/financeiro/inadimplencia';
export const URL_TITULOS_INADIMPLENTES = `${URL_INADIMPLENCIA}/titulos`;
export const URL_COBRANCAS = `${URL_INADIMPLENCIA}/cobrancas`;

/** Painel do dia: A receber hoje, vencidos, aging e inadimplentes. */
export function usePainelInadimplencia() {
  return useQuery({
    queryKey: ['financeiro', 'inadimplencia', 'painel'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_INADIMPLENCIA}/painel`, { schema: painelInadimplenciaSchema, signal }),
  });
}

const CHAVE_REGUA = ['financeiro', 'inadimplencia', 'regua'] as const;

/** Os quatro marcos da régua de cobrança, em ordem. */
export function useRegua() {
  return useQuery({
    queryKey: CHAVE_REGUA,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_INADIMPLENCIA}/regua`, { schema: reguaCobrancaSchema, signal }),
  });
}

/**
 * Altera um marco (liga/desliga, canais e texto). Ao concluir, a régua e o histórico são
 * buscados de novo e o alerta interno é recalculado no próximo ciclo da central de notificações.
 */
export function useAtualizarMarco(marco: Pick<ReguaMarco, 'id'>, { formulario = false } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: UpdateReguaMarcoInput) =>
      apiFetch(`${URL_INADIMPLENCIA}/regua/${marco.id}`, {
        method: 'PATCH',
        body: dados,
        schema: reguaMarcoSchema,
      }),
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE_REGUA });
      toast.success(i18next.t('inadimplencia.regua.sucesso'));
    },
  });
}
