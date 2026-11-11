import {
  anamnesePageSchema,
  anamneseSchema,
  atendimentoPageSchema,
  atendimentoSchema,
  historicoClinicoPageSchema,
  pacienteResumoProntuarioSchema,
  pacientesComRegistrosPageSchema,
  prontuarioSchema,
  type Anamnese,
  type Atendimento,
  type CreateAnamneseInput,
  type CreateAtendimentoInput,
  type UpsertProntuarioInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_PRONTUARIOS = '/api/consultorio-assistencial/prontuarios';

/** Tamanho de página das abas de registros: a tela não tem paginação própria nelas. */
export const TAMANHO_PAGINA_REGISTROS = 100;

export function usePacientesComRegistros(search: string, page = 1) {
  return useQuery({
    queryKey: ['prontuarios', 'lista', search, page] as const,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(URL_PRONTUARIOS, {
        query: { page, pageSize: 10, search: search || undefined },
        schema: pacientesComRegistrosPageSchema,
        signal,
      }),
  });
}

export function usePacienteResumo(pacienteId: string | null) {
  return useQuery({
    queryKey: ['prontuarios', 'paciente', pacienteId] as const,
    enabled: Boolean(pacienteId),
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PRONTUARIOS}/${pacienteId}/paciente`, {
        schema: pacienteResumoProntuarioSchema,
        signal,
      }),
  });
}

export function useProntuario(pacienteId: string | null) {
  return useQuery({
    queryKey: ['prontuarios', 'prontuario', pacienteId] as const,
    enabled: Boolean(pacienteId),
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PRONTUARIOS}/${pacienteId}`, { schema: prontuarioSchema, signal }),
  });
}

export function useSalvarProntuario(pacienteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: UpsertProntuarioInput) =>
      apiFetch(`${URL_PRONTUARIOS}/${pacienteId}`, {
        method: 'PUT',
        body: dados,
        schema: prontuarioSchema,
      }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['prontuarios', 'prontuario', pacienteId] });
      toast.success('Prontuário atualizado.');
    },
  });
}

export function useAtendimentos(pacienteId: string | null) {
  return useQuery({
    queryKey: ['prontuarios', 'atendimentos', pacienteId] as const,
    enabled: Boolean(pacienteId),
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PRONTUARIOS}/${pacienteId}/atendimentos`, {
        query: { page: 1, pageSize: TAMANHO_PAGINA_REGISTROS },
        schema: atendimentoPageSchema,
        signal,
      }),
  });
}

export function useCriarAtendimento(pacienteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: CreateAtendimentoInput): Promise<Atendimento> =>
      apiFetch(`${URL_PRONTUARIOS}/${pacienteId}/atendimentos`, {
        method: 'POST',
        body: dados,
        schema: atendimentoSchema,
      }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['prontuarios', 'atendimentos', pacienteId] }),
        queryClient.invalidateQueries({
          queryKey: ['prontuarios', 'historico-clinico', pacienteId],
        }),
      ]);
      toast.success('Atendimento criado.');
    },
  });
}

export function useAnamneses(pacienteId: string | null) {
  return useQuery({
    queryKey: ['prontuarios', 'anamneses', pacienteId] as const,
    enabled: Boolean(pacienteId),
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PRONTUARIOS}/${pacienteId}/anamneses`, {
        query: { page: 1, pageSize: TAMANHO_PAGINA_REGISTROS },
        schema: anamnesePageSchema,
        signal,
      }),
  });
}

export function useCriarAnamnese(pacienteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: CreateAnamneseInput): Promise<Anamnese> =>
      apiFetch(`${URL_PRONTUARIOS}/${pacienteId}/anamneses`, {
        method: 'POST',
        body: dados,
        schema: anamneseSchema,
      }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['prontuarios', 'anamneses', pacienteId] }),
        queryClient.invalidateQueries({
          queryKey: ['prontuarios', 'historico-clinico', pacienteId],
        }),
      ]);
      toast.success('Anamnese criada.');
    },
  });
}

export function useHistoricoClinico(pacienteId: string | null) {
  return useQuery({
    queryKey: ['prontuarios', 'historico-clinico', pacienteId] as const,
    enabled: Boolean(pacienteId),
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PRONTUARIOS}/${pacienteId}/historico-clinico`, {
        query: { page: 1, pageSize: TAMANHO_PAGINA_REGISTROS },
        schema: historicoClinicoPageSchema,
        signal,
      }),
  });
}
