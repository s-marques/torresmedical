import { apiErrorSchema, traduzirValidacao, type ApiError, type ErrorDetail } from '@torres/shared';
import { i18next, traduzirErroApi } from '@/lib/i18n';
import { BASE_PT_BR } from '@/lib/i18n/locales/base';

/** Textos em português (para os testes); na tela, use `erroConexao()`/`erroInesperadoApi()`. */
export const ERRO_CONEXAO = BASE_PT_BR.erros.conexao;
export const ERRO_INESPERADO_API = BASE_PT_BR.erros.inesperado;

/** "Falha de conexão…" no idioma atual. */
export function erroConexao(): string {
  return i18next.t('erros.conexao');
}

/** "Não foi possível concluir a operação…" no idioma atual. */
export function erroInesperadoApi(): string {
  return i18next.t('erros.inesperado');
}

/** Mensagem de um erro de campo: pela chave (`code`/`params`) quando houver; senão, a do servidor. */
export function mensagemDoDetalhe({ code, params, message }: ErrorDetail): string {
  return code ? traduzirValidacao(code, params) : message;
}

/**
 * Erro de uma chamada à API, com o corpo padrão de erro quando houver. Status 0: sem resposta.
 * A mensagem vem no idioma do usuário quando o `code` tem tradução (issue #205).
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
    message = body ? traduzirErroApi(body.code, body.message) : erroInesperadoApi(),
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * Converte uma resposta de erro em `ApiRequestError`, lendo o corpo padrão (`apiErrorSchema`)
 * quando ele vier no formato esperado.
 */
export function erroDaResposta(
  status: number,
  corpo: unknown,
  mensagemPadrao = erroInesperadoApi(),
): ApiRequestError {
  const erro = apiErrorSchema.safeParse(corpo);
  return erro.success
    ? new ApiRequestError(status, erro.data)
    : new ApiRequestError(status, null, mensagemPadrao);
}
