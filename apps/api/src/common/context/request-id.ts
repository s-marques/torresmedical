import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

// Aceita o id vindo de um proxy só se for curto e seguro para log.
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

type RequestWithId = IncomingMessage & { requestId?: string };

/**
 * Resolve o requestId uma única vez por requisição e o devolve no header de resposta.
 * Usado pelo logger (pino-http) e pelo contexto (nestjs-cls), independente da ordem dos middlewares.
 */
export function resolveRequestId(req: IncomingMessage, res?: ServerResponse): string {
  const request = req as RequestWithId;
  if (!request.requestId) {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
    request.requestId = candidate && VALID_REQUEST_ID.test(candidate) ? candidate : randomUUID();
  }
  if (res && !res.headersSent) {
    res.setHeader(REQUEST_ID_HEADER, request.requestId);
  }
  return request.requestId;
}
