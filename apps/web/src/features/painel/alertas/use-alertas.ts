import { alertaSchema, alertasResumoSchema } from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermissao } from '@/lib/auth/use-sessao';
import { apiFetch } from '@/lib/api/client';

const CHAVE = ['painel', 'alertas'] as const;
const URL_ALERTAS = '/api/painel/alertas';

/** Alertas do dia do usuário (central de notificações). Atualiza a cada 5 minutos e ao focar a aba. */
export function useAlertas(incluirResolvidos: boolean) {
  const podeVer = usePermissao('painel.painel.ver');
  return useQuery({
    queryKey: [...CHAVE, { incluirResolvidos }],
    queryFn: ({ signal }) =>
      apiFetch(URL_ALERTAS, {
        query: { incluirResolvidos: incluirResolvidos ? 'true' : 'false' },
        schema: alertasResumoSchema,
        signal,
      }),
    enabled: podeVer,
    refetchInterval: 5 * 60_000,
  });
}

/** `lido` ou `resolvido`: estado pessoal do alerta. */
export function useMarcarAlerta(acao: 'lido' | 'resolvido') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`${URL_ALERTAS}/${id}/${acao}`, { method: 'PATCH', schema: alertaSchema }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  });
}
