import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { AuditLogPage, AuditLogQuery } from '@torres/shared';
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
 * Grava e consulta o audit_log (somente inserção). Use `record` diretamente em operações
 * sem request HTTP (filas, jobs, lote); nos endpoints, use `@Audit`.
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

  async findMany(query: AuditLogQuery): Promise<AuditLogPage> {
    const where: Prisma.AuditLogWhereInput = {
      entity: query.entity,
      entityId: query.entityId,
      userId: query.userId,
      action: query.action,
      occurredAt: query.de || query.ate ? { gte: query.de, lte: query.ate } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.txHost.tx.auditLog.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.txHost.tx.auditLog.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
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
