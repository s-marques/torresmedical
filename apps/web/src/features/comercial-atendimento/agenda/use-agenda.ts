import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  agendaProfissionaisSchema,
  agendamentoListaSchema,
  agendamentoSchema,
  salaSugeridaSchema,
  type AgendaProfissional,
  type Agendamento,
  type CreateAgendamentoInput,
  type SalaSugerida,
  type UpdateAgendamentoInput,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
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

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Sala do contrato do profissional para o dia e a hora (issue #136). Só consulta com os três
 * valores válidos; o resultado é uma sugestão, a sala pode ser outra.
 */
export function useSalaSugerida(
  profissionalId: string | null | undefined,
  data: string | null | undefined,
  hora: string | null | undefined,
) {
  const completo = Boolean(profissionalId) && DATA_ISO.test(data ?? '') && HORA.test(hora ?? '');
  return useQuery({
    queryKey: ['agenda', 'sala-sugerida', profissionalId, data, hora] as const,
    enabled: completo,
    queryFn: ({ signal }): Promise<SalaSugerida> =>
      apiFetch(`${URL_AGENDAMENTOS}/sala-sugerida`, {
        query: { profissionalId, data, hora },
        schema: salaSugeridaSchema,
        signal,
      }),
  });
}

/** Reagenda: troca sala, data, hora e/ou duração. Conflitos (409) voltam como erro do formulário. */
export function useAlterarAgendamento(id: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (dados: UpdateAgendamentoInput) =>
      apiFetch(`${URL_AGENDAMENTOS}/${id}`, {
        method: 'PATCH',
        body: dados,
        schema: agendamentoSchema,
      }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agendaKeys.todas });
      toast.success(t('agenda.editar.sucesso'));
    },
  });
}
