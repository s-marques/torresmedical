import {
  arquivoLinkSchema,
  contratoSalaSchema,
  type CancelarContratoSalaInput,
  type ContratoSala,
  type CreateContratoSalaInput,
  type EncerrarContratoSalaInput,
  type UpdateContratoSalaInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_CONTRATOS = '/api/gestao-profissionais/contratos-sala';

/** Mutations da aba: ao concluir, a tabela e os cards (que sabem se a sala tem contrato) recarregam. */
function useMutationContrato<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<ContratoSala>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_CONTRATOS] }),
        queryClient.invalidateQueries({ queryKey: ['salas'] }),
      ]);
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_CONTRATOS}${path}`, { method, body, schema: contratoSalaSchema });
}

export function useCriarContrato() {
  return useMutationContrato((dados: CreateContratoSalaInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Contrato criado.',
  });
}

export function useAlterarContrato(id: string) {
  return useMutationContrato((dados: UpdateContratoSalaInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'Contrato atualizado.',
  });
}

export function useExcluirContrato() {
  return useMutationContrato((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Contrato excluído.',
  });
}

/** Anexa (ou remove, com `null`) o PDF do contrato, já enviado em `/api/arquivos`. */
export function useDefinirPdfContrato() {
  return useMutationContrato(
    ({ id, arquivoId }: { id: string; arquivoId: string | null }) =>
      chamar(`/${id}/pdf`, 'PUT', { arquivoId }),
    { sucesso: undefined },
  );
}

/** Link temporário para ver o PDF do contrato. */
export function linkDoPdf(arquivoId: string) {
  return apiFetch(`/api/arquivos/${arquivoId}/link`, { schema: arquivoLinkSchema });
}

/** Encerra (término natural) o contrato ativo, gravando a data. */
export function useEncerrarContrato(id: string) {
  return useMutationContrato(
    (dados: EncerrarContratoSalaInput) => chamar(`/${id}/encerrar`, 'POST', dados),
    { formulario: true, sucesso: 'Contrato encerrado.' },
  );
}

/** Cancela (rescisão) o contrato ativo, gravando a data e o motivo. */
export function useCancelarContrato(id: string) {
  return useMutationContrato(
    (dados: CancelarContratoSalaInput) => chamar(`/${id}/cancelar`, 'POST', dados),
    { formulario: true, sucesso: 'Contrato cancelado.' },
  );
}
