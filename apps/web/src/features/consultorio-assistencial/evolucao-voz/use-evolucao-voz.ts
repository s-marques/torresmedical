import {
  EVOLUCAO_VOZ_PAGE_SIZE,
  evolucaoPageSchema,
  evolucaoSchema,
  evolucaoVozAgendamentoPageSchema,
  evolucaoVozAgendamentoSchema,
  type CreateEvolucaoVozInput,
  type Evolucao,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_EVOLUCAO_VOZ = '/api/consultorio-assistencial/evolucao-voz';

/** O histórico não tem paginação própria na tela. */
const TAMANHO_HISTORICO = 100;

const CHAVE = 'evolucao-voz';

export interface FiltrosAgendamentosHoje {
  data: string;
  search?: string;
  profissionalId?: string | null;
}

/** "Agendamentos de Hoje", com os filtros do "Buscar paciente". */
export function useAgendamentosHoje({ data, search, profissionalId }: FiltrosAgendamentosHoje) {
  return useQuery({
    queryKey: [CHAVE, 'lista', data, search ?? '', profissionalId ?? ''] as const,
    queryFn: ({ signal }) =>
      apiFetch(URL_EVOLUCAO_VOZ, {
        query: {
          data,
          page: 1,
          pageSize: EVOLUCAO_VOZ_PAGE_SIZE,
          search: search || undefined,
          profissionalId: profissionalId ?? undefined,
        },
        schema: evolucaoVozAgendamentoPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useAgendamentoEvolucaoVoz(agendamentoId: string) {
  return useQuery({
    queryKey: [CHAVE, 'agendamento', agendamentoId] as const,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_EVOLUCAO_VOZ}/${agendamentoId}`, {
        schema: evolucaoVozAgendamentoSchema,
        signal,
      }),
  });
}

export function useHistoricoEvolucoes(agendamentoId: string) {
  return useQuery({
    queryKey: [CHAVE, 'evolucoes', agendamentoId] as const,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_EVOLUCAO_VOZ}/${agendamentoId}/evolucoes`, {
        query: { page: 1, pageSize: TAMANHO_HISTORICO },
        schema: evolucaoPageSchema,
        signal,
      }),
  });
}

/** "Salvar Evolução": o back inicia o atendimento se ainda não houver um. */
export function useSalvarEvolucaoVoz(agendamentoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: CreateEvolucaoVozInput): Promise<Evolucao> =>
      apiFetch(`${URL_EVOLUCAO_VOZ}/${agendamentoId}/evolucoes`, {
        method: 'POST',
        body: dados,
        schema: evolucaoSchema,
      }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      // O status do agendamento pode ter mudado para "Em atendimento".
      await queryClient.invalidateQueries({ queryKey: [CHAVE] });
      toast.success('Evolução salva.');
    },
  });
}
