import type { NextFunction, Request, Response } from 'express';
import { ApiException, ValidationException } from './api.exception';
import { ErrorCode } from './error-codes';

/**
 * Middleware de erro registrado logo após o body-parser. Sem ele, o Nest transforma o erro de
 * JSON malformado em `BadRequestException` com a mensagem do parser em inglês.
 */
export function mapBodyParserErrors(
  error: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const type = (error as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed') {
    next(new ValidationException([], 'JSON inválido no corpo da requisição'));
  } else if (type === 'entity.too.large') {
    next(new ApiException(413, ErrorCode.PAYLOAD_TOO_LARGE, 'Conteúdo muito grande'));
  } else {
    next(error);
  }
}
