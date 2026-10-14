/** Códigos estáveis de erro da API (UPPER_SNAKE_CASE). Erros de negócio definem os seus. */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  DUPLICATE: 'DUPLICATE',
  RELATION_CONFLICT: 'RELATION_CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  BUSINESS_RULE: 'BUSINESS_RULE',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  BAD_REQUEST: 'BAD_REQUEST',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

interface StatusDefault {
  code: string;
  message: string;
}

/** Código e mensagem em português usados quando a exceção não traz os seus. */
const STATUS_DEFAULTS: Readonly<Record<number, StatusDefault>> = {
  400: { code: ErrorCode.VALIDATION_ERROR, message: 'Dados inválidos' },
  401: { code: ErrorCode.UNAUTHORIZED, message: 'Não autenticado' },
  403: { code: ErrorCode.FORBIDDEN, message: 'Sem permissão' },
  404: { code: ErrorCode.NOT_FOUND, message: 'Recurso não encontrado' },
  405: { code: ErrorCode.METHOD_NOT_ALLOWED, message: 'Método não permitido' },
  409: { code: ErrorCode.CONFLICT, message: 'Conflito com o estado atual do registro' },
  413: { code: ErrorCode.PAYLOAD_TOO_LARGE, message: 'Conteúdo muito grande' },
  422: { code: ErrorCode.BUSINESS_RULE, message: 'Operação não permitida' },
  429: {
    code: ErrorCode.TOO_MANY_REQUESTS,
    message: 'Muitas requisições. Tente novamente em instantes',
  },
};

export const INTERNAL_ERROR_MESSAGE = 'Erro interno. Tente novamente mais tarde';

export function statusDefault(status: number): StatusDefault {
  if (status >= 500) return { code: ErrorCode.INTERNAL_ERROR, message: INTERNAL_ERROR_MESSAGE };
  return STATUS_DEFAULTS[status] ?? { code: ErrorCode.BAD_REQUEST, message: 'Requisição inválida' };
}
