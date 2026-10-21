import {
  contratoHoraSchema,
  contratoHorasResponseSchema,
  type CreateContratoHoraInput,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { URL_CONTRATOS } from './use-contratos-sala';

const CHAVE = 'horas-contrato';

/** Horas lançadas no mês (`mes` = `AAAA-MM`), com o resumo do contrato. */
export function useHorasContrato(contratoId: string, mes: string) {
  return useQuery({
    queryKey: [CHAVE, contratoId, mes],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_CONTRATOS}/${contratoId}/horas`, {
        query: { mes },
        schema: contratoHorasResponseSchema,
        signal,
      }),
  });
}

export function useLancarHora(contratoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: META_FORMULARIO,
    mutationFn: (dados: CreateContratoHoraInput) =>
      apiFetch(`${URL_CONTRATOS}/${contratoId}/horas`, {
        method: 'POST',
        body: dados,
        schema: contratoHoraSchema,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [CHAVE, contratoId] });
      toast.success('Hora lançada.');
    },
  });
}

export function useRemoverHora(contratoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (horaId: string) =>
      apiFetch(`${URL_CONTRATOS}/${contratoId}/horas/${horaId}`, {
        method: 'DELETE',
        schema: contratoHoraSchema,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [CHAVE, contratoId] });
      toast.success('Lançamento removido.');
    },
  });
}
