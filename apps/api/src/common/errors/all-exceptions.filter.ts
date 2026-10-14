import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { resolveRequestId } from '../context/request-id';
import { toApiError } from './to-api-error';

/**
 * Filtro global: toda resposta de erro sai no formato
 * `{ statusCode, code, message, details?, requestId }` (CLAUDE.md, seção 3).
 * Erros 5xx vão para o log com stack, mas sem a mensagem de erros do Prisma,
 * que pode conter valores de campos (dados pessoais).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = resolveRequestId(request);
    const body = { ...toApiError(exception), requestId };

    if (body.statusCode >= 500) {
      this.logger.error({ requestId, error: describeForLog(exception) }, 'Erro não tratado');
    }
    if (response.headersSent) return;
    response.status(body.statusCode).json(body);
  }
}

/** Resumo seguro para log: tipo, código e stack; mensagem só de erros que não são do Prisma. */
export function describeForLog(exception: unknown): Record<string, unknown> {
  if (!(exception instanceof Error)) return { type: typeof exception };

  const prismaCode = (exception as { code?: unknown }).code;
  if (isPrismaError(exception)) {
    return {
      type: exception.name,
      code: typeof prismaCode === 'string' ? prismaCode : undefined,
      stack: stackFrames(exception.stack),
    };
  }
  return { type: exception.name, message: exception.message, stack: exception.stack };
}

function isPrismaError(exception: Error): boolean {
  return (
    exception instanceof Prisma.PrismaClientKnownRequestError ||
    exception instanceof Prisma.PrismaClientUnknownRequestError ||
    exception instanceof Prisma.PrismaClientValidationError ||
    exception instanceof Prisma.PrismaClientRustPanicError ||
    exception instanceof Prisma.PrismaClientInitializationError
  );
}

/** Só as linhas "at ..." do stack, sem a mensagem. */
function stackFrames(stack: string | undefined): string | undefined {
  return stack
    ?.split('\n')
    .filter((line) => line.trimStart().startsWith('at '))
    .join('\n');
}
