import {
  catalogoPacotePageSchema,
  pacoteSchema,
  type Pacote,
  type PacoteInput,
  type RegistrarUsoPacoteInput,
} from '@torres/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_PACOTES = '/api/comercial-atendimento/pacotes';

/** Itens por consulta da busca de produtos; acima disso o usuário refina a busca. */
export const CATALOGO_TAMANHO = 20;

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_PACOTES}${path}`, { method, body, schema: pacoteSchema });
}

/** Atualiza a listagem do `DataGrid` e o detalhe em cache depois de uma escrita. */
function useAposEscrita() {
  const queryClient = useQueryClient();
  return async (pacote: Pacote, sucesso: string) => {
    queryClient.setQueryData(['pacotes', pacote.id], pacote);
    await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_PACOTES] });
    toast.success(sucesso);
  };
}

export function useCriarPacote() {
  const aposEscrita = useAposEscrita();
  return useMutation({
    mutationFn: (dados: PacoteInput) => chamar('', 'POST', dados),
    meta: META_FORMULARIO,
    onSuccess: (pacote) => aposEscrita(pacote, 'Pacote cadastrado.'),
  });
}

export function useEditarPacote(id: string) {
  const aposEscrita = useAposEscrita();
  return useMutation({
    mutationFn: (dados: PacoteInput) => chamar(`/${id}`, 'PATCH', dados),
    meta: META_FORMULARIO,
    onSuccess: (pacote) => aposEscrita(pacote, 'Pacote atualizado.'),
  });
}

export function useExcluirPacote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => chamar(`/${id}`, 'DELETE'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_PACOTES] });
      toast.success('Pacote excluído.');
    },
  });
}

/** Detalhe do pacote: parte da linha do grid e é atualizado depois de cada uso de sessão. */
export function usePacote(inicial: Pacote) {
  return useQuery({
    queryKey: ['pacotes', inicial.id],
    initialData: inicial,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PACOTES}/${inicial.id}`, { schema: pacoteSchema, signal }),
  });
}

export function useRegistrarUso(id: string) {
  const aposEscrita = useAposEscrita();
  return useMutation({
    mutationFn: (dados: RegistrarUsoPacoteInput) => chamar(`/${id}/usos`, 'POST', dados),
    meta: META_FORMULARIO,
    onSuccess: (pacote) => aposEscrita(pacote, 'Uso de sessão registrado.'),
  });
}

export function useRemoverUso(id: string) {
  const aposEscrita = useAposEscrita();
  return useMutation({
    mutationFn: (usoId: string) => chamar(`/${id}/usos/${usoId}`, 'DELETE'),
    onSuccess: (pacote) => aposEscrita(pacote, 'Uso de sessão removido.'),
  });
}

/** Produtos e procedimentos que podem entrar no pacote (busca do modal). */
export function useCatalogoPacote(search: string) {
  return useQuery({
    queryKey: ['pacotes', 'catalogo', search],
    placeholderData: keepPreviousData,
    enabled: search !== '',
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PACOTES}/catalogo`, {
        query: { search, pageSize: CATALOGO_TAMANHO },
        schema: catalogoPacotePageSchema,
        signal,
      }),
  });
}
