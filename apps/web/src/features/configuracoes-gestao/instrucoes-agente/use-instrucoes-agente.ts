import {
  agenteAlertaDestinoPageSchema,
  agenteAlertaDestinoSchema,
  agenteInstrucaoExtraPageSchema,
  agenteInstrucaoExtraSchema,
  agenteInstrucaoPageSchema,
  agenteInstrucaoSchema,
  agenteInstrucaoVersoesSchema,
  agenteRegraSchema,
  type AgenteInstrucaoStatus,
  type CreateAgenteAlertaDestinoInput,
  type CreateAgenteInstrucaoExtraInput,
  type CreateAgenteInstrucaoInput,
  type CreateAgenteRegraInput,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

const RAIZ = '/api/configuracoes-gestao';
export const URL_INSTRUCOES = `${RAIZ}/agente-instrucoes`;
export const URL_EXTRAS = `${RAIZ}/agente-instrucoes-extras`;
export const URL_DESTINOS = `${RAIZ}/agente-alertas-destinos`;
export const URL_REGRAS = `${RAIZ}/agente-regras`;

const CHAVE_INSTRUCOES = ['instrucoes-agente', 'instrucoes'] as const;
const CHAVE_EXTRAS = ['instrucoes-agente', 'extras'] as const;
const CHAVE_DESTINOS = ['instrucoes-agente', 'destinos'] as const;

/** As abas mostram cards e listas curtas, sem paginação (como no sistema atual): página máxima. */
const PAGINA_UNICA = { page: 1, pageSize: 100 } as const;

export function useInstrucoes() {
  return useQuery({
    queryKey: CHAVE_INSTRUCOES,
    queryFn: ({ signal }) =>
      apiFetch(URL_INSTRUCOES, {
        query: { ...PAGINA_UNICA, sort: 'createdAt:asc' },
        schema: agenteInstrucaoPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useVersoesInstrucao(id: string) {
  return useQuery({
    queryKey: [...CHAVE_INSTRUCOES, id, 'versoes'],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_INSTRUCOES}/${id}/versoes`, { schema: agenteInstrucaoVersoesSchema, signal }),
  });
}

export function useExtras() {
  return useQuery({
    queryKey: CHAVE_EXTRAS,
    queryFn: ({ signal }) =>
      apiFetch(URL_EXTRAS, {
        query: { ...PAGINA_UNICA, sort: 'createdAt:asc' },
        schema: agenteInstrucaoExtraPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useDestinos() {
  return useQuery({
    queryKey: CHAVE_DESTINOS,
    queryFn: ({ signal }) =>
      apiFetch(URL_DESTINOS, {
        query: { ...PAGINA_UNICA, sort: 'createdAt:asc' },
        schema: agenteAlertaDestinoPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

type Metodo = 'POST' | 'PATCH' | 'DELETE';

/** Mutation com refresh da lista/grid e toast de sucesso opcional. */
function useMutacao<TVariaveis, TResposta>(
  chamar: (variaveis: TVariaveis) => Promise<TResposta>,
  opcoes: { chaves: readonly (readonly unknown[])[]; formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chamar,
    meta: opcoes.formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await Promise.all(
        opcoes.chaves.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      if (opcoes.sucesso) toast.success(opcoes.sucesso);
    },
  });
}

function chamar<T>(url: string, schema: z.ZodType<T>, method: Metodo, body?: unknown): Promise<T> {
  return apiFetch(url, { method, body, schema });
}

const CHAVES_INSTRUCOES = [CHAVE_INSTRUCOES] as const;
const CHAVES_EXTRAS = [CHAVE_EXTRAS] as const;
const CHAVES_DESTINOS = [CHAVE_DESTINOS] as const;
/** O `DataGrid` das regras usa esta chave de consulta. */
const CHAVES_REGRAS = [['data-grid', URL_REGRAS]] as const;

// Instruções
export function useSalvarInstrucao(id?: string) {
  return useMutacao(
    (dados: CreateAgenteInstrucaoInput) =>
      chamar(
        id ? `${URL_INSTRUCOES}/${id}` : URL_INSTRUCOES,
        agenteInstrucaoSchema,
        id ? 'PATCH' : 'POST',
        dados,
      ),
    { chaves: CHAVES_INSTRUCOES, formulario: true },
  );
}

export function useAlterarStatusInstrucao() {
  return useMutacao(
    ({ id, status }: { id: string; status: AgenteInstrucaoStatus }) =>
      chamar(`${URL_INSTRUCOES}/${id}/status`, agenteInstrucaoSchema, 'PATCH', { status }),
    { chaves: CHAVES_INSTRUCOES, sucesso: 'Status da instrução atualizado.' },
  );
}

export function useRestaurarVersao() {
  return useMutacao(
    ({ id, numero }: { id: string; numero: number }) =>
      chamar(`${URL_INSTRUCOES}/${id}/versoes/${numero}/restaurar`, agenteInstrucaoSchema, 'POST'),
    {
      chaves: [...CHAVES_INSTRUCOES],
      sucesso: 'Versão restaurada como rascunho.',
    },
  );
}

export function useExcluirInstrucao() {
  return useMutacao(
    (id: string) => chamar(`${URL_INSTRUCOES}/${id}`, agenteInstrucaoSchema, 'DELETE'),
    { chaves: CHAVES_INSTRUCOES, sucesso: 'Instrução excluída.' },
  );
}

// Instruções extras
export function useSalvarExtra(id?: string) {
  return useMutacao(
    (dados: CreateAgenteInstrucaoExtraInput) =>
      chamar(
        id ? `${URL_EXTRAS}/${id}` : URL_EXTRAS,
        agenteInstrucaoExtraSchema,
        id ? 'PATCH' : 'POST',
        dados,
      ),
    { chaves: CHAVES_EXTRAS, formulario: true },
  );
}

export function useAlterarAtivoExtra() {
  return useMutacao(
    ({ id, ativo }: { id: string; ativo: boolean }) =>
      chamar(`${URL_EXTRAS}/${id}/ativo`, agenteInstrucaoExtraSchema, 'PATCH', { ativo }),
    { chaves: CHAVES_EXTRAS },
  );
}

export function useExcluirExtra() {
  return useMutacao(
    (id: string) => chamar(`${URL_EXTRAS}/${id}`, agenteInstrucaoExtraSchema, 'DELETE'),
    { chaves: CHAVES_EXTRAS, sucesso: 'Instrução extra excluída.' },
  );
}

// Destinos de alerta
export function useAdicionarDestino() {
  return useMutacao(
    (dados: CreateAgenteAlertaDestinoInput) =>
      chamar(URL_DESTINOS, agenteAlertaDestinoSchema, 'POST', dados),
    { chaves: CHAVES_DESTINOS, formulario: true, sucesso: 'Destino adicionado.' },
  );
}

export function useExcluirDestino() {
  return useMutacao(
    (id: string) => chamar(`${URL_DESTINOS}/${id}`, agenteAlertaDestinoSchema, 'DELETE'),
    { chaves: CHAVES_DESTINOS, sucesso: 'Destino removido.' },
  );
}

// Regras
export function useSalvarRegra(id?: string) {
  return useMutacao(
    (dados: CreateAgenteRegraInput) =>
      chamar(
        id ? `${URL_REGRAS}/${id}` : URL_REGRAS,
        agenteRegraSchema,
        id ? 'PATCH' : 'POST',
        dados,
      ),
    { chaves: CHAVES_REGRAS, formulario: true },
  );
}

export function useAlterarAtivoRegra() {
  return useMutacao(
    ({ id, ativo }: { id: string; ativo: boolean }) =>
      chamar(`${URL_REGRAS}/${id}/ativo`, agenteRegraSchema, 'PATCH', { ativo }),
    { chaves: CHAVES_REGRAS },
  );
}

export function useExcluirRegra() {
  return useMutacao((id: string) => chamar(`${URL_REGRAS}/${id}`, agenteRegraSchema, 'DELETE'), {
    chaves: CHAVES_REGRAS,
    sucesso: 'Regra excluída.',
  });
}
