import { apiErrorSchema, type ApiError } from '@torres/shared';

export const ERRO_CONEXAO = 'Falha de conexão. Tente novamente';
export const ERRO_INESPERADO_API = 'Não foi possível concluir a operação. Tente novamente';

/** Erro de uma chamada à API, com o corpo padrão de erro quando houver. Status 0: sem resposta. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
    message = body?.message ?? ERRO_INESPERADO_API,
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
  mensagemPadrao = ERRO_INESPERADO_API,
): ApiRequestError {
  const erro = apiErrorSchema.safeParse(corpo);
  return erro.success
    ? new ApiRequestError(status, erro.data)
    : new ApiRequestError(status, null, mensagemPadrao);
}
