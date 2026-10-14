import { HttpException } from '@nestjs/common';
import type { ErrorDetail } from '@torres/shared';
import { ErrorCode } from './error-codes';

/** Exceção com código estável e detalhes por campo, já no formato da resposta de erro. */
export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super({ statusCode: status, code, message, details }, status);
  }
}

export interface BusinessExceptionOptions {
  /** Padrão 422. Use 400 quando o erro deve aparecer num campo do formulário, 409 para conflito. */
  status?: number;
  details?: ErrorDetail[];
}

/**
 * Erro de regra de negócio (unicidade, saldo, status permitido...), com `code` estável.
 * Ex.: `throw new BusinessException('UNIDADE_DUPLICADA', 'Já existe uma unidade com este nome', { status: 409 })`.
 */
export class BusinessException extends ApiException {
  constructor(code: string, message: string, options: BusinessExceptionOptions = {}) {
    super(options.status ?? 422, code, message, options.details);
  }
}

/** 400 `VALIDATION_ERROR` com os erros por campo. */
export class ValidationException extends ApiException {
  constructor(details: ErrorDetail[], message = 'Dados inválidos') {
    super(400, ErrorCode.VALIDATION_ERROR, message, details);
  }
}
