import {
  atendimentoEmCursoSchema,
  atendimentoMedicoDetalheSchema,
  evolucaoPageSchema,
  evolucaoSchema,
  pacienteDadosAtendimentoSchema,
  type AtendimentoEmCurso,
  type CreateEvolucaoInput,
  type Evolucao,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_ATENDIMENTO_MEDICO = '/api/consultorio-assistencial/atendimento-medico';

/** O histórico de evoluções não tem paginação própria na tela. */
const TAMANHO_HISTORICO = 100;

const CHAVE = 'atendimento-medico';

export function useDetalheAtendimento(agendamentoId: string) {
  return useQuery({
    queryKey: [CHAVE, 'detalhe', agendamentoId] as const,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_ATENDIMENTO_MEDICO}/${agendamentoId}`, {
        schema: atendimentoMedicoDetalheSchema,
        signal,
      }),
  });
}

/** "Atender"/"Iniciar Atendimento": grava a entrada e muda o status para Em Atendimento. */
export function useIniciarAtendimento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agendamentoId: string): Promise<AtendimentoEmCurso> =>
      apiFetch(`${URL_ATENDIMENTO_MEDICO}/${agendamentoId}/iniciar`, {
        method: 'POST',
        schema: atendimentoEmCursoSchema,
      }),
    onSuccess: async (_atendimento, agendamentoId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CHAVE, 'detalhe', agendamentoId] }),
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_ATENDIMENTO_MEDICO] }),
      ]);
      toast.success('Atendimento iniciado.');
    },
  });
}

export function useEvolucoes(agendamentoId: string) {
  return useQuery({
    queryKey: [CHAVE, 'evolucoes', agendamentoId] as const,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_ATENDIMENTO_MEDICO}/${agendamentoId}/evolucoes`, {
        query: { page: 1, pageSize: TAMANHO_HISTORICO },
        schema: evolucaoPageSchema,
        signal,
      }),
  });
}

export function useSalvarEvolucao(agendamentoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: CreateEvolucaoInput): Promise<Evolucao> =>
      apiFetch(`${URL_ATENDIMENTO_MEDICO}/${agendamentoId}/evolucoes`, {
        method: 'POST',
        body: dados,
        schema: evolucaoSchema,
      }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [CHAVE, 'evolucoes', agendamentoId] });
      toast.success('Evolução salva.');
    },
  });
}

export function useDadosPaciente(agendamentoId: string) {
  return useQuery({
    queryKey: [CHAVE, 'paciente', agendamentoId] as const,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_ATENDIMENTO_MEDICO}/${agendamentoId}/paciente`, {
        schema: pacienteDadosAtendimentoSchema,
        signal,
      }),
  });
}
