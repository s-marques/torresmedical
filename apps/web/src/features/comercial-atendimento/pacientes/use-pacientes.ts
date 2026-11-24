import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  auditLogPageSchema,
  consentimentoSchema,
  consentimentosResponseSchema,
  pacienteResumoSchema,
  pacienteSchema,
  verificacaoDuplicidadePacienteSchema,
  type AuditLogItem,
  type ConsentimentoInput,
  type Paciente,
  type PacienteInput,
  type PacientePossivelDuplicado,
  type VerificarDuplicidadePacienteInput,
} from '@torres/shared';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { i18next } from '@/lib/i18n';

export const URL_PACIENTES = '/api/comercial-atendimento/pacientes';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationPaciente<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<Paciente>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_PACIENTES] });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_PACIENTES}${path}`, { method, body, schema: pacienteSchema });
}

/** O formulário envia o valor de entrada do schema; a API valida e normaliza (vazio vira null). */
export function useCriarPaciente() {
  return useMutationPaciente((dados: PacienteInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Paciente cadastrado.',
  });
}

export function useEditarPaciente(id: string) {
  return useMutationPaciente((dados: PacienteInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'Paciente atualizado.',
  });
}

export function useExcluirPaciente() {
  return useMutationPaciente((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Paciente excluído.',
  });
}

/**
 * Histórico do paciente: alterações gravadas no `audit_log` (`GET /api/auditoria`, restrito a
 * quem tem `configuracoes-gestao.auditoria.ver`).
 */
export function useHistoricoPaciente(id: string) {
  return useQuery({
    queryKey: ['historico-paciente', id],
    queryFn: ({ signal }): Promise<{ data: AuditLogItem[] }> =>
      apiFetch('/api/auditoria', {
        query: { entity: 'Paciente', entityId: id, pageSize: 100 },
        schema: auditLogPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

/** Histórico de consentimentos (LGPD) do paciente, do mais recente ao mais antigo. */
export function useConsentimentos(pacienteId: string) {
  return useQuery({
    queryKey: ['consentimentos-paciente', pacienteId],
    queryFn: ({ signal }) =>
      apiFetch(`${URL_PACIENTES}/${pacienteId}/consentimentos`, {
        schema: consentimentosResponseSchema,
        signal,
      }),
  });
}

/** Registra um aceite ou uma revogação; o histórico e a lista são buscados de novo. */
export function useRegistrarConsentimento(pacienteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: ConsentimentoInput) =>
      apiFetch(`${URL_PACIENTES}/${pacienteId}/consentimentos`, {
        method: 'POST',
        body: dados,
        schema: consentimentoSchema,
      }),
    meta: META_FORMULARIO,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['consentimentos-paciente', pacienteId] }),
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_PACIENTES] }),
      ]);
      toast.success(i18next.t('pacientes.consentimentos.registrar.sucesso'));
    },
  });
}

/** Dados que identificam o paciente na verificação de duplicidade (issue #149). */
export type DadosIdentificacao = Pick<
  VerificarDuplicidadePacienteInput,
  'nome' | 'email' | 'telefone' | 'celular' | 'dataNascimento'
>;

/**
 * `POST /pacientes/duplicidade`: possíveis cadastros do mesmo paciente. Na edição, `pacienteId`
 * faz a API ignorar o próprio paciente e o que não mudou.
 */
export function verificarDuplicidade(
  dados: DadosIdentificacao,
  pacienteId?: string,
): Promise<PacientePossivelDuplicado[]> {
  return apiFetch(`${URL_PACIENTES}/duplicidade`, {
    method: 'POST',
    body: { ...dados, pacienteId },
    schema: verificacaoDuplicidadePacienteSchema,
  }).then((r) => r.candidatos);
}

/** "Abrir registro existente": busca o paciente escolhido no alerta. */
export function useAbrirPaciente() {
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`${URL_PACIENTES}/${id}`, { schema: pacienteResumoSchema }),
  });
}
