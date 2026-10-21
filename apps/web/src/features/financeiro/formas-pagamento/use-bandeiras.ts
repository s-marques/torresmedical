import {
  bandeiraPageSchema,
  bandeiraSchema,
  type Bandeira,
  type CreateBandeiraInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_BANDEIRAS = '/api/financeiro/bandeiras';

const CHAVE = ['bandeiras'] as const;

/** A aba mostra todas as bandeiras de uma vez, sem paginação: busca a primeira página no tamanho máximo. */
export function useBandeiras() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: ({ signal }) =>
      apiFetch(URL_BANDEIRAS, {
        query: { page: 1, pageSize: 100, sort: 'nome:asc' },
        schema: bandeiraPageSchema,
        signal,
      }),
  });
}

export function useCriarBandeira() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: CreateBandeiraInput): Promise<Bandeira> =>
      apiFetch(URL_BANDEIRAS, { method: 'POST', body: dados, schema: bandeiraSchema }),
    meta: META_FORMULARIO,
    onSuccess: async (bandeira) => {
      await queryClient.invalidateQueries({ queryKey: CHAVE });
      toast.success(`${bandeira.nome} criada!`);
    },
  });
}
