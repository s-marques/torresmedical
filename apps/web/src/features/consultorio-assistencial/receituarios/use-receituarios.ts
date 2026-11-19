import {
  prescricaoSchema,
  receituarioBlocoSchema,
  receituarioBlocosDisponiveisSchema,
  type CreatePrescricaoInput,
  type CreateReceituarioBlocoInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

const URL_RECEITUARIOS = '/api/consultorio-assistencial/receituarios';
export const URL_BLOCOS = `${URL_RECEITUARIOS}/blocos`;
export const URL_PRESCRICOES = `${URL_RECEITUARIOS}/prescricoes`;
const CHAVE_DISPONIVEIS = ['receituarios', 'blocos-disponiveis'] as const;

/** Select "Bloco" da Nova Prescricao: blocos Ativos, com médico e no escopo do usuário. */
export function useBlocosDisponiveis() {
  return useQuery({
    queryKey: CHAVE_DISPONIVEIS,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_BLOCOS}/disponiveis`, { schema: receituarioBlocosDisponiveisSchema, signal }),
  });
}

/** Ao cadastrar, as duas listagens e o select de blocos são buscados de novo (Usados/Total muda). */
function useInvalidarReceituarios() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['data-grid', URL_BLOCOS] }),
      queryClient.invalidateQueries({ queryKey: ['data-grid', URL_PRESCRICOES] }),
      queryClient.invalidateQueries({ queryKey: CHAVE_DISPONIVEIS }),
    ]);
}

export function useCriarBloco() {
  const invalidar = useInvalidarReceituarios();
  return useMutation({
    mutationFn: (dados: CreateReceituarioBlocoInput) =>
      apiFetch(URL_BLOCOS, { method: 'POST', body: dados, schema: receituarioBlocoSchema }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await invalidar();
      toast.success('Bloco cadastrado.');
    },
  });
}

export function useCriarPrescricao() {
  const invalidar = useInvalidarReceituarios();
  return useMutation({
    mutationFn: (dados: CreatePrescricaoInput) =>
      apiFetch(URL_PRESCRICOES, { method: 'POST', body: dados, schema: prescricaoSchema }),
    meta: META_FORMULARIO,
    onSuccess: async (prescricao) => {
      await invalidar();
      toast.success(`Prescrição nº ${String(prescricao.numero).padStart(6, '0')} registrada.`);
    },
  });
}
