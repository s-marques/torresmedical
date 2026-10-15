import { toast } from 'sonner';
import { ApiRequestError, ERRO_INESPERADO_API } from './api-error';

export const MENSAGEM_SEM_PERMISSAO = 'Sem permissão';

export interface TratarErroOptions {
  /** Chamado no 401 (sessão ausente ou expirada): leva para o login. */
  onUnauthorized: () => void;
}

/**
 * Tratamento centralizado dos erros da API (CLAUDE.md, seção 3, "Tratamento de erros"):
 * - 401 redireciona para o login;
 * - 403 mostra "Sem permissão";
 * - 400 com `details` fica para o formulário mapear nos campos (`errosPorCampo`), sem toast;
 * - os demais erros aparecem em toast.
 * Cancelamentos (`AbortError`) são ignorados.
 */
export function tratarErroApi(error: unknown, { onUnauthorized }: TratarErroOptions): void {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  if (!(error instanceof ApiRequestError)) {
    toast.error(ERRO_INESPERADO_API);
    return;
  }
  if (error.status === 401) {
    onUnauthorized();
    return;
  }
  if (error.status === 403) {
    toast.error(MENSAGEM_SEM_PERMISSAO);
    return;
  }
  if (error.status === 400 && error.body?.details?.length) return;
  toast.error(error.message);
}

/** Erros de validação (400) por campo, para o formulário: `{ cpf: 'CPF inválido' }`. */
export function errosPorCampo(error: unknown): Record<string, string> {
  if (!(error instanceof ApiRequestError) || error.status !== 400) return {};
  const erros: Record<string, string> = {};
  for (const { field, message } of error.body?.details ?? []) {
    erros[field] ??= message;
  }
  return erros;
}
