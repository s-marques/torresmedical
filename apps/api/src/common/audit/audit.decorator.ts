import { SetMetadata } from '@nestjs/common';
import type { AuditAction } from '../../generated/prisma/client';

export const AUDIT_METADATA = 'torres:audit';

export interface AuditOptions {
  /** Nome da entidade gravado no audit_log, ex.: `ContaReceber`. */
  entity: string;
  /** Padrão: deduzida do método HTTP (POST → CREATE, PATCH/PUT → UPDATE, DELETE → DELETE). */
  action?: AuditAction;
  /** Parâmetro de rota com o id do registro. Padrão: `id`. */
  idParam?: string;
  /** Model Prisma usado para carregar o `before`. Padrão: o próprio `entity`. */
  model?: string;
}

/**
 * Audita o endpoint de escrita (CLAUDE.md, seção 4). O `AuditInterceptor` abre uma
 * transação, carrega o `before` (UPDATE/DELETE), executa o handler e grava o audit_log
 * na mesma transação, usando o retorno do handler como `after`.
 */
export const Audit = (options: AuditOptions): MethodDecorator & ClassDecorator =>
  SetMetadata(AUDIT_METADATA, options);

const ACTION_BY_METHOD: Readonly<Record<string, AuditAction>> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

export function resolveAuditAction(method: string, explicit?: AuditAction): AuditAction {
  const action = explicit ?? ACTION_BY_METHOD[method.toUpperCase()];
  if (!action) {
    throw new Error(`@Audit em ${method} precisa informar "action" explicitamente.`);
  }
  return action;
}
