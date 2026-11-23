import { useQuery } from '@tanstack/react-query';
import { agendaMatrizSchema, type AgendaMatriz, type AgendaMatrizFiltros } from '@torres/shared';
import { apiFetch } from '@/lib/api/client';

export const URL_AGENDA_MATRIZ = '/api/comercial-atendimento/agenda-matriz';

/** Sob `['agenda']`: criar ou reagendar um agendamento também atualiza a matriz. */
export const matrizKeys = {
  consulta: (filtros: AgendaMatrizFiltros) => ['agenda', 'matriz', filtros] as const,
};

/** Sala × dia × horário (dia) ou turno (semana e mês) do período e dos filtros (issue #137). */
export function useAgendaMatriz(filtros: AgendaMatrizFiltros) {
  return useQuery({
    queryKey: matrizKeys.consulta(filtros),
    queryFn: ({ signal }): Promise<AgendaMatriz> =>
      apiFetch(URL_AGENDA_MATRIZ, { query: { ...filtros }, schema: agendaMatrizSchema, signal }),
  });
}
