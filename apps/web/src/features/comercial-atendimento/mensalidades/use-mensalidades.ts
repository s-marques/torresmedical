import {
  descreverResumoGerarTitulos,
  gerarTitulosMensalidadesResumoSchema,
  mensalidadeSchema,
  type GerarTitulosMensalidadesInput,
  type MensalidadeInput,
  type MensalidadeStatus,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_MENSALIDADES = '/api/comercial-atendimento/mensalidades';

function chamar(path: string, method: 'POST' | 'PATCH', body: unknown) {
  return apiFetch(`${URL_MENSALIDADES}${path}`, { method, body, schema: mensalidadeSchema });
}

/** Atualiza a listagem do `DataGrid` e avisa o usuário depois de uma escrita. */
function useAposEscrita() {
  const queryClient = useQueryClient();
  return async (sucesso: string) => {
    await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_MENSALIDADES] });
    toast.success(sucesso);
  };
}

export function useCriarMensalidade() {
  const aposEscrita = useAposEscrita();
  return useMutation({
    mutationFn: (dados: MensalidadeInput) => chamar('', 'POST', dados),
    meta: META_FORMULARIO,
    onSuccess: () => aposEscrita('Mensalidade cadastrada.'),
  });
}

export function useEditarMensalidade(id: string) {
  const aposEscrita = useAposEscrita();
  return useMutation({
    mutationFn: (dados: MensalidadeInput) => chamar(`/${id}`, 'PATCH', dados),
    meta: META_FORMULARIO,
    onSuccess: () => aposEscrita('Mensalidade atualizada.'),
  });
}

const SUCESSO_STATUS: Record<MensalidadeStatus, string> = {
  ATIVO: 'Mensalidade reativada.',
  PAUSADO: 'Mensalidade pausada.',
  CANCELADO: 'Mensalidade cancelada.',
};

/** Botões Pausar, Reativar e Cancelar da linha. */
export function useMudarStatusMensalidade() {
  const aposEscrita = useAposEscrita();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: MensalidadeStatus }) =>
      chamar(`/${id}/status`, 'PATCH', { status }),
    onSuccess: (mensalidade) => aposEscrita(SUCESSO_STATUS[mensalidade.status]),
  });
}

/** "Gerar Titulos do Mes": o aviso traz quantos títulos foram gerados e quantos já existiam. */
export function useGerarTitulosMensalidades() {
  return useMutation({
    mutationFn: (dados: GerarTitulosMensalidadesInput) =>
      apiFetch(`${URL_MENSALIDADES}/gerar-titulos`, {
        method: 'POST',
        body: dados,
        schema: gerarTitulosMensalidadesResumoSchema,
      }),
    meta: META_FORMULARIO,
    onSuccess: (resumo) => {
      toast.success(descreverResumoGerarTitulos(resumo));
    },
  });
}
