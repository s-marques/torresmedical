import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  auditLogPageSchema,
  pacienteSchema,
  type AuditLogItem,
  type Paciente,
  type PacienteInput,
} from '@torres/shared';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

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
