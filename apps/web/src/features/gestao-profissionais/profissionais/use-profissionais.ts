import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  arquivoLinkSchema,
  bloqueioAgendaSchema,
  bloqueiosResponseSchema,
  especialidadePageSchema,
  especialidadeSchema,
  horariosResponseSchema,
  profissionalSchema,
  type BloqueioAgenda,
  type CriarBloqueioInput,
  type EspecialidadeInput,
  type HorarioAtendimento,
  type HorarioAtendimentoInput,
  type Profissional,
  type ProfissionalArquivoCampo,
  type ProfissionalInput,
} from '@torres/shared';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_PROFISSIONAIS = '/api/gestao-profissionais/profissionais';
export const URL_ESPECIALIDADES = '/api/gestao-profissionais/especialidades';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationProfissional<TVariaveis, TResposta = Profissional>(
  mutationFn: (variaveis: TVariaveis) => Promise<TResposta>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_PROFISSIONAIS] });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_PROFISSIONAIS}${path}`, { method, body, schema: profissionalSchema });
}

/** O formulário envia o valor de entrada do schema; a API valida e normaliza (vazio vira null). */
export function useCriarProfissional() {
  return useMutationProfissional((dados: ProfissionalInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Profissional cadastrado.',
  });
}

export function useEditarProfissional(id: string) {
  return useMutationProfissional((dados: ProfissionalInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'Profissional atualizado.',
  });
}

/** Ativar / Desativar (menu da linha). */
export function useAlterarStatusProfissional() {
  return useMutationProfissional(
    ({ id, ativo }: { id: string; ativo: boolean }) => chamar(`/${id}/status`, 'PATCH', { ativo }),
    {},
  );
}

export function useExcluirProfissional() {
  return useMutationProfissional((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Profissional excluído.',
  });
}

/** Foto ou logo da receita: o arquivo já foi enviado em `/api/arquivos`. */
export function useDefinirArquivoProfissional(id: string) {
  return useMutationProfissional(
    ({ campo, arquivoId }: { campo: ProfissionalArquivoCampo; arquivoId: string | null }) =>
      chamar(`/${id}/arquivos/${campo}`, 'PUT', { arquivoId }),
    {},
  );
}

/** Link temporário para exibir um arquivo (`<img src>`). */
export function useLinkArquivo(arquivoId: string | null) {
  return useQuery({
    queryKey: ['arquivo-link', arquivoId],
    enabled: arquivoId !== null,
    // O link expira (5 min): não reaproveita um link velho.
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      apiFetch(`/api/arquivos/${arquivoId}/link`, { schema: arquivoLinkSchema, signal }),
  });
}

// ---------------------------------------------------------------------------------------------
// Horários de atendimento

const CHAVE_HORARIOS = 'horarios-profissional';

export function useHorarios(profissionalId: string) {
  return useQuery({
    queryKey: [CHAVE_HORARIOS, profissionalId],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PROFISSIONAIS}/${profissionalId}/horarios`, {
        schema: horariosResponseSchema,
        signal,
      }),
  });
}

export function useSalvarHorarios(profissionalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: META_FORMULARIO,
    mutationFn: (horarios: HorarioAtendimentoInput[]) =>
      apiFetch(`${URL_PROFISSIONAIS}/${profissionalId}/horarios`, {
        method: 'PUT',
        body: { horarios },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [CHAVE_HORARIOS, profissionalId] });
      toast.success('Horários salvos.');
    },
  });
}

export type { HorarioAtendimento };

// ---------------------------------------------------------------------------------------------
// Bloqueios de agenda

const CHAVE_BLOQUEIOS = 'bloqueios-profissional';

export function useBloqueios(profissionalId: string) {
  return useQuery({
    queryKey: [CHAVE_BLOQUEIOS, profissionalId],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PROFISSIONAIS}/${profissionalId}/bloqueios`, {
        schema: bloqueiosResponseSchema,
        signal,
      }),
  });
}

function useMutationBloqueio<TVariaveis>(
  profissionalId: string,
  mutationFn: (variaveis: TVariaveis) => Promise<BloqueioAgenda>,
  sucesso: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [CHAVE_BLOQUEIOS, profissionalId] });
      toast.success(sucesso);
    },
  });
}

export function useCriarBloqueio(profissionalId: string) {
  return useMutationBloqueio(
    profissionalId,
    (dados: CriarBloqueioInput) =>
      apiFetch(`${URL_PROFISSIONAIS}/${profissionalId}/bloqueios`, {
        method: 'POST',
        body: dados,
        schema: bloqueioAgendaSchema,
      }),
    'Agenda bloqueada.',
  );
}

export function useRemoverBloqueio(profissionalId: string) {
  return useMutationBloqueio(
    profissionalId,
    (bloqueioId: string) =>
      apiFetch(`${URL_PROFISSIONAIS}/${profissionalId}/bloqueios/${bloqueioId}`, {
        method: 'DELETE',
        schema: bloqueioAgendaSchema,
      }),
    'Bloqueio removido.',
  );
}

// ---------------------------------------------------------------------------------------------
// Especialidades (modal Gerenciar Especialidades)

const CHAVE_ESPECIALIDADES = ['especialidades-gerenciar'] as const;

/** Todas as especialidades (a lista do modal não pagina). */
export function useEspecialidades() {
  return useQuery({
    queryKey: CHAVE_ESPECIALIDADES,
    queryFn: ({ signal }) =>
      apiFetch(URL_ESPECIALIDADES, {
        query: { page: 1, pageSize: 100, sort: 'nome:asc' },
        schema: especialidadePageSchema,
        signal,
      }),
  });
}

function useMutationEspecialidade<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<unknown>,
  sucesso: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: META_FORMULARIO,
    onSuccess: async () => {
      // O combobox de especialidade (Novo/Editar Profissional) lê o lookup, que também muda.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CHAVE_ESPECIALIDADES }),
        queryClient.invalidateQueries({ queryKey: ['lookups', 'especialidades'] }),
      ]);
      toast.success(sucesso);
    },
  });
}

function chamarEspecialidade(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_ESPECIALIDADES}${path}`, { method, body, schema: especialidadeSchema });
}

export function useAdicionarEspecialidade() {
  return useMutationEspecialidade(
    (dados: EspecialidadeInput) => chamarEspecialidade('', 'POST', dados),
    'Especialidade adicionada.',
  );
}

export function useRenomearEspecialidade() {
  return useMutationEspecialidade(
    ({ id, nome }: { id: string; nome: string }) =>
      chamarEspecialidade(`/${id}`, 'PATCH', { nome }),
    'Especialidade atualizada.',
  );
}

export function useExcluirEspecialidade() {
  return useMutationEspecialidade(
    (id: string) => chamarEspecialidade(`/${id}`, 'DELETE'),
    'Especialidade excluída.',
  );
}
