import { toast } from 'sonner';
import { i18next } from '@/lib/i18n';
import { BASE_PT_BR } from '@/lib/i18n/locales/base';
import { ApiRequestError, erroInesperadoApi, mensagemDoDetalhe } from './api-error';

/** "Sem permissão" em português (testes); na tela vale `erros.semPermissao` no idioma atual. */
export const MENSAGEM_SEM_PERMISSAO = BASE_PT_BR.erros.semPermissao;

export interface TratarErroOptions {
  /** Chamado no 401 (sessão ausente ou expirada): leva para o login. */
  onUnauthorized: () => void;
}

export interface TratarErroContexto {
  /**
   * O erro aparece no formulário (`FormLayout`): trata só 401 e 403; os demais (400, 409,
   * 422, 500…) ficam para o formulário mostrar nos campos ou no alerta, sem toast.
   */
  erroNoFormulario?: boolean;
}

/**
 * Tratamento centralizado dos erros da API (CLAUDE.md, seção 3, "Tratamento de erros"):
 * - 401 redireciona para o login;
 * - 403 mostra "Sem permissão";
 * - 400 com `details` fica para o formulário mapear nos campos (`errosPorCampo`), sem toast;
 * - os demais erros aparecem em toast.
 * Cancelamentos (`AbortError`) são ignorados. Com `erroNoFormulario`, só 401 e 403 são tratados aqui.
 */
export function tratarErroApi(
  error: unknown,
  { onUnauthorized }: TratarErroOptions,
  { erroNoFormulario = false }: TratarErroContexto = {},
): void {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  const status = error instanceof ApiRequestError ? error.status : null;
  if (status === 401) {
    onUnauthorized();
    return;
  }
  if (status === 403) {
    toast.error(i18next.t('erros.semPermissao'));
    return;
  }
  if (erroNoFormulario) return;
  if (!(error instanceof ApiRequestError)) {
    toast.error(erroInesperadoApi());
    return;
  }
  if (error.status === 400 && error.body?.details?.length) return;
  toast.error(error.message);
}

/** Erros de validação (400) por campo, para o formulário: `{ cpf: 'CPF inválido' }`. */
export function errosPorCampo(error: unknown): Record<string, string> {
  if (!(error instanceof ApiRequestError) || error.status !== 400) return {};
  const erros: Record<string, string> = {};
  for (const detalhe of error.body?.details ?? []) {
    erros[detalhe.field] ??= mensagemDoDetalhe(detalhe);
  }
  return erros;
}
