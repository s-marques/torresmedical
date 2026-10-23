import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  agendaProfissionaisSchema,
  agendamentoListaSchema,
  agendamentoSchema,
  type AgendaProfissional,
  type Agendamento,
  type CreateAgendamentoInput,
} from '@torres/shared';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import type { Periodo } from './agenda-datas';

export const URL_AGENDAMENTOS = '/api/comercial-atendimento/agendamentos';

export const agendaKeys = {
  todas: ['agenda'] as const,
  lista: (periodo: Periodo, profissionalId: string | null) =>
    ['agenda', 'agendamentos', periodo.inicio, periodo.fim, profissionalId] as const,
  profissionais: ['agenda', 'profissionais'] as const,
};

/** Agendamentos do período, opcionalmente de um só profissional. */
export function useAgendamentos(periodo: Periodo, profissionalId: string | null) {
  return useQuery({
    queryKey: agendaKeys.lista(periodo, profissionalId),
    queryFn: async ({ signal }): Promise<Agendamento[]> => {
      const lista = await apiFetch(URL_AGENDAMENTOS, {
        query: { ...periodo, profissionalId },
        schema: agendamentoListaSchema,
        signal,
      });
      return lista.data;
    },
  });
}

/** Profissionais ativos: colunas da visão Dia e opções do filtro. */
export function useProfissionaisAgenda() {
  return useQuery({
    queryKey: agendaKeys.profissionais,
    queryFn: async ({ signal }): Promise<AgendaProfissional[]> => {
      const lista = await apiFetch(`${URL_AGENDAMENTOS}/profissionais`, {
        schema: agendaProfissionaisSchema,
        signal,
      });
      return lista.data;
    },
  });
}

export function useCriarAgendamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: CreateAgendamentoInput) =>
      apiFetch(URL_AGENDAMENTOS, { method: 'POST', body: dados, schema: agendamentoSchema }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agendaKeys.todas });
      toast.success('Agendamento criado.');
    },
  });
}
