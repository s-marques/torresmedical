import { politicaSegurancaSchema, type PoliticaSegurancaInput } from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18next from 'i18next';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

const URL_POLITICA = '/api/configuracoes-gestao/politica-seguranca';
const CHAVE_POLITICA = ['politica-seguranca'];

/** Política de segurança da empresa (issue #156): senha, bloqueio e encerramento de acesso. */
export function usePoliticaSeguranca() {
  return useQuery({
    queryKey: CHAVE_POLITICA,
    queryFn: ({ signal }) => apiFetch(URL_POLITICA, { schema: politicaSegurancaSchema, signal }),
  });
}

export function useSalvarPoliticaSeguranca() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: META_FORMULARIO,
    mutationFn: (dados: PoliticaSegurancaInput) =>
      apiFetch(URL_POLITICA, { method: 'PUT', body: dados, schema: politicaSegurancaSchema }),
    onSuccess: (politica) => {
      queryClient.setQueryData(CHAVE_POLITICA, politica);
      toast.success(i18next.t('seguranca.salva'));
    },
  });
}
