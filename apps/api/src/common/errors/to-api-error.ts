import { HttpException } from '@nestjs/common';
import type { ApiError } from '@torres/shared';
import { ApiException } from './api.exception';
import { statusDefault } from './error-codes';
import { fromPrismaError } from './prisma-errors';

// Mensagens padrão do Nest/Express em inglês: trocadas pela mensagem em português do status.
const FRAMEWORK_PHRASES = new Set([
  'Bad Request',
  'Unauthorized',
  'Forbidden',
  'Not Found',
  'Method Not Allowed',
  'Not Acceptable',
  'Request Timeout',
  'Conflict',
  'Gone',
  'Precondition Failed',
  'Payload Too Large',
  'Unsupported Media Type',
  'Unprocessable Entity',
  'Too Many Requests',
  'Http Exception',
]);
// Inclui o URIError do Express (parâmetro com % inválido).
const FRAMEWORK_MESSAGE =
  /^(Cannot [A-Z]+ \/|Validation failed|ThrottlerException|URI malformed|Failed to decode param)/;

type ErrorBody = Omit<ApiError, 'requestId'>;

/** Converte qualquer exceção no corpo padrão de erro, sem expor stack, SQL nem dados. */
export function toApiError(exception: unknown): ErrorBody {
  const prisma = fromPrismaError(exception);
  if (prisma) return fromApiException(prisma);
  if (exception instanceof ApiException) return fromApiException(exception);
  if (exception instanceof HttpException) return fromHttpException(exception);

  return { statusCode: 500, ...statusDefault(500) };
}

function fromApiException(exception: ApiException): ErrorBody {
  const status = exception.getStatus();
  return {
    statusCode: status,
    code: exception.code,
    message: status >= 500 ? statusDefault(status).message : exception.message,
    ...(exception.details?.length ? { details: exception.details } : {}),
  };
}

function fromHttpException(exception: HttpException): ErrorBody {
  const status = exception.getStatus();
  const fallback = statusDefault(status);
  const message = status < 500 ? customMessage(exception) : undefined;
  return { statusCode: status, code: fallback.code, message: message ?? fallback.message };
}

function customMessage(exception: HttpException): string | undefined {
  const response = exception.getResponse();
  const raw = typeof response === 'string' ? response : (response as { message?: unknown }).message;
  const message = Array.isArray(raw) ? raw.join('; ') : raw;
  if (typeof message !== 'string' || isFrameworkMessage(message)) return undefined;
  return message;
}

function isFrameworkMessage(message: string): boolean {
  return FRAMEWORK_PHRASES.has(message) || FRAMEWORK_MESSAGE.test(message);
}
