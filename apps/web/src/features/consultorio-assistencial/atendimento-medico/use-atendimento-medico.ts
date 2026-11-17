import {
  atendimentoEmCursoSchema,
  atendimentoMedicoDetalheSchema,
  evolucaoPageSchema,
  evolucaoSchema,
  historicoAtendimentoPageSchema,
  orcamentoPageSchema,
  pacienteDadosAtendimentoSchema,
  pagamentoAtendimentoSchema,
  protocoloCategoriasSchema,
  protocoloReceitaPageSchema,
  receitaPageSchema,
  receitaSchema,
  recebimentoSchema,
  type AtendimentoEmCurso,
  type CreateEvolucaoInput,
  type CreateReceitaInput,
  type CreateRecebimentoInput,
  type Evolucao,
  type Receita,
  type Recebimento,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { URL_ORCAMENTOS } from '@/features/comercial-atendimento/orcamentos/use-orcamentos';

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

/** "Finalizar": grava o horário de fim e muda o agendamento para Atendido. */
export function useFinalizarAtendimento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agendamentoId: string): Promise<AtendimentoEmCurso> =>
      apiFetch(`${URL_ATENDIMENTO_MEDICO}/${agendamentoId}/finalizar`, {
        method: 'POST',
        schema: atendimentoEmCursoSchema,
      }),
    onSuccess: async (_atendimento, agendamentoId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CHAVE, 'detalhe', agendamentoId] }),
        queryClient.invalidateQueries({ queryKey: [CHAVE, 'historico', agendamentoId] }),
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_ATENDIMENTO_MEDICO] }),
      ]);
      toast.success('Atendimento finalizado.');
    },
  });
}

// --- Aba Receita -----------------------------------------------------------------------

export function useReceitas(agendamentoId: string) {
  return useQuery({
    queryKey: [CHAVE, 'receitas', agendamentoId] as const,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_ATENDIMENTO_MEDICO}/${agendamentoId}/receitas`, {
        query: { page: 1, pageSize: TAMANHO_HISTORICO },
        schema: receitaPageSchema,
        signal,
      }),
  });
}

export function useSalvarReceita(agendamentoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: CreateReceitaInput): Promise<Receita> =>
      apiFetch(`${URL_ATENDIMENTO_MEDICO}/${agendamentoId}/receitas`, {
        method: 'POST',
        body: dados,
        schema: receitaSchema,
      }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CHAVE, 'receitas', agendamentoId] }),
        queryClient.invalidateQueries({ queryKey: [CHAVE, 'historico', agendamentoId] }),
      ]);
      toast.success('Receita salva.');
    },
  });
}

/** Itens por consulta do seletor de protocolos; acima disso o usuário refina a busca. */
const TAMANHO_PROTOCOLOS = 50;

export function useProtocolosReceita(search: string, categoria: string | undefined) {
  return useQuery({
    queryKey: [CHAVE, 'protocolos', search, categoria] as const,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_ATENDIMENTO_MEDICO}/protocolos`, {
        query: { search: search || undefined, categoria, pageSize: TAMANHO_PROTOCOLOS },
        schema: protocoloReceitaPageSchema,
        signal,
      }),
  });
}

export function useCategoriasProtocolos() {
  return useQuery({
    queryKey: [CHAVE, 'protocolos', 'categorias'] as const,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_ATENDIMENTO_MEDICO}/protocolos/categorias`, {
        schema: protocoloCategoriasSchema,
        signal,
      }),
  });
}

// --- Aba Pagamento ---------------------------------------------------------------------

export function usePagamento(agendamentoId: string) {
  return useQuery({
    queryKey: [CHAVE, 'pagamento', agendamentoId] as const,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_ATENDIMENTO_MEDICO}/${agendamentoId}/pagamento`, {
        schema: pagamentoAtendimentoSchema,
        signal,
      }),
  });
}

/** "Registrar Pagamento": ao quitar, a coluna Pgto da lista e o cabeçalho mudam. */
export function useRegistrarRecebimento(agendamentoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: CreateRecebimentoInput): Promise<Recebimento> =>
      apiFetch(`${URL_ATENDIMENTO_MEDICO}/${agendamentoId}/recebimentos`, {
        method: 'POST',
        body: dados,
        schema: recebimentoSchema,
      }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CHAVE, 'pagamento', agendamentoId] }),
        queryClient.invalidateQueries({ queryKey: [CHAVE, 'detalhe', agendamentoId] }),
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_ATENDIMENTO_MEDICO] }),
      ]);
      toast.success('Pagamento registrado.');
    },
  });
}

// --- Abas Histórico e Orçamento --------------------------------------------------------

export function useHistorico(agendamentoId: string) {
  return useQuery({
    queryKey: [CHAVE, 'historico', agendamentoId] as const,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_ATENDIMENTO_MEDICO}/${agendamentoId}/historico`, {
        query: { page: 1, pageSize: TAMANHO_HISTORICO },
        schema: historicoAtendimentoPageSchema,
        signal,
      }),
  });
}

/** Orçamentos do paciente (tela Orçamentos, comercial-atendimento), mais recentes primeiro. */
export function useOrcamentosPaciente(pacienteId: string) {
  return useQuery({
    queryKey: ['data-grid', URL_ORCAMENTOS, 'paciente', pacienteId] as const,
    queryFn: ({ signal }) =>
      apiFetch(URL_ORCAMENTOS, {
        query: { pacienteId, sort: 'data:desc', pageSize: TAMANHO_HISTORICO },
        schema: orcamentoPageSchema,
        signal,
      }),
  });
}
