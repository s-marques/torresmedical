import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { Prisma, type AuditAction } from '../../generated/prisma/client';
import { RequestContextService } from '../context/request-context.service';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import { toAuditJson } from './audit-json';
import { ANONYMOUS_USER_ID, SYSTEM_USER_ID } from './audit.constants';

export interface AuditRecordInput {
  action: AuditAction;
  entity: string;
  entityId: string;
  /** Estado anterior (null/omitido em CREATE). */
  before?: unknown;
  /** Estado resultante (null/omitido em DELETE). */
  after?: unknown;
  /** Padrão: usuário do contexto; `anonymous` em HTTP sem login; `system` fora de HTTP. */
  userId?: string;
}

/**
 * Grava o audit_log (somente inserção; a consulta fica no `AuditConsultaService`). Use `record`
 * diretamente em operações sem request HTTP (filas, jobs, lote); nos endpoints, use `@Audit`.
 * Dentro de uma transação aberta, o registro entra nela.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly context: RequestContextService,
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    await this.txHost.tx.auditLog.create({
      data: {
        userId: input.userId ?? this.currentUserId(),
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        before: toJsonColumn(input.before),
        after: toJsonColumn(input.after),
        requestId: this.context.getRequestId() ?? null,
        ip: this.context.getIp() ?? null,
      },
    });
  }

  private currentUserId(): string {
    const userId = this.context.getUserId();
    if (userId) return userId;
    // Só requisições HTTP têm requestId.
    return this.context.getRequestId() ? ANONYMOUS_USER_ID : SYSTEM_USER_ID;
  }
}

function toJsonColumn(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return toAuditJson(value) ?? Prisma.DbNull;
}
