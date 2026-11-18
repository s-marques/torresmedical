import {
  campanhaPageSchema,
  campanhaSchema,
  destinatarioPageSchema,
  mensagemAutomaticaListaSchema,
  mensagemAutomaticaSchema,
  resumoCampanhasSchema,
  type CampanhaFiltro,
  type CampanhaInput,
  type MensagemAutomaticaInput,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_CAMPANHAS = '/api/comercial-atendimento/campanhas';
export const URL_AUTOMACOES = '/api/comercial-atendimento/mensagens-automaticas';

const CHAVE = ['campanhas'] as const;
/** Os cartões da aba mostram até 100 campanhas (as mais recentes primeiro). */
const TAMANHO_LISTA = 100;

export function useCampanhas() {
  return useQuery({
    queryKey: [...CHAVE, 'lista'],
    queryFn: ({ signal }) =>
      apiFetch(URL_CAMPANHAS, {
        query: { pageSize: TAMANHO_LISTA },
        schema: campanhaPageSchema,
        signal,
      }),
  });
}

export function useMensagensAutomaticas() {
  return useQuery({
    queryKey: [...CHAVE, 'automacoes'],
    queryFn: ({ signal }) =>
      apiFetch(URL_AUTOMACOES, { schema: mensagemAutomaticaListaSchema, signal }),
  });
}

export function useResumoCampanhas() {
  return useQuery({
    queryKey: [...CHAVE, 'resumo'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_CAMPANHAS}/resumo`, { schema: resumoCampanhasSchema, signal }),
  });
}

export interface FiltroConsulta {
  filtro: CampanhaFiltro;
  origemClienteId?: string | null;
  diasCompra?: number | null;
}

/** "Visualizar Clientes". */
export function useDestinatarios(filtro: FiltroConsulta, page: number) {
  return useQuery({
    queryKey: [...CHAVE, 'destinatarios', filtro, page],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_CAMPANHAS}/destinatarios`, {
        query: {
          filtro: filtro.filtro,
          origemClienteId: filtro.origemClienteId ?? undefined,
          diasCompra: filtro.diasCompra ?? undefined,
          page,
        },
        schema: destinatarioPageSchema,
        signal,
      }),
  });
}

function useEscrita<V>(
  chamar: (variaveis: V) => Promise<unknown>,
  sucesso: string,
  formulario = false,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chamar,
    ...(formulario ? { meta: META_FORMULARIO } : {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE });
      toast.success(sucesso);
    },
  });
}

type Metodo = 'POST' | 'PATCH' | 'DELETE';
const campanha = (path: string, method: Metodo, body?: unknown) =>
  apiFetch(`${URL_CAMPANHAS}${path}`, { method, body, schema: campanhaSchema });
const automacao = (path: string, method: Metodo, body?: unknown) =>
  apiFetch(`${URL_AUTOMACOES}${path}`, { method, body, schema: mensagemAutomaticaSchema });

export function useSalvarCampanha(id?: string) {
  return useEscrita(
    (dados: CampanhaInput) =>
      id ? campanha(`/${id}`, 'PATCH', dados) : campanha('', 'POST', dados),
    id ? 'Campanha atualizada.' : 'Campanha criada.',
    true,
  );
}

export function useCancelarCampanha() {
  return useEscrita((id: string) => campanha(`/${id}/cancelar`, 'PATCH'), 'Campanha cancelada.');
}

export function useExcluirCampanha() {
  return useEscrita((id: string) => campanha(`/${id}`, 'DELETE'), 'Campanha excluída.');
}

export function useSalvarAutomacao(id?: string) {
  return useEscrita(
    (dados: MensagemAutomaticaInput) =>
      id ? automacao(`/${id}`, 'PATCH', dados) : automacao('', 'POST', dados),
    id ? 'Automação atualizada.' : 'Automação criada.',
    true,
  );
}

export function useAtivarAutomacao() {
  return useEscrita(
    ({ id, ativa }: { id: string; ativa: boolean }) =>
      automacao(`/${id}/ativa`, 'PATCH', { ativa }),
    'Automação atualizada.',
  );
}

export function useExcluirAutomacao() {
  return useEscrita((id: string) => automacao(`/${id}`, 'DELETE'), 'Automação excluída.');
}
