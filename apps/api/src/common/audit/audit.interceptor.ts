import { TransactionHost } from '@nestjs-cls/transactional';
import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { defer, lastValueFrom, mergeMap, type Observable } from 'rxjs';
import type { AuditAction } from '../../generated/prisma/client';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import { ALL_ENTITIES_ID } from './audit.constants';
import { AUDIT_METADATA, resolveAuditAction, type AuditOptions } from './audit.decorator';
import { AuditService } from './audit.service';

// Todos os ids do schema são uuid. Um id inválido não chega ao banco: o pipe do handler
// (ex.: ParseUUIDPipe) responde 400 e nada é auditado.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FindUniqueDelegate = { findUnique: (args: { where: { id: string } }) => Promise<unknown> };

/**
 * Interceptor global da auditoria (CLAUDE.md, seção 4). Só age em handlers com `@Audit`.
 * CREATE/UPDATE/DELETE rodam numa transação: handler e audit_log são gravados juntos,
 * e uma falha no handler (ou na auditoria) desfaz tudo. EXPORT não abre transação.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<AuditOptions | undefined>(AUDIT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options || context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const action = resolveAuditAction(request.method, options.action);
    const rawId = request.params?.[options.idParam ?? 'id'];
    const paramId = typeof rawId === 'string' ? rawId : undefined;

    if (action === 'EXPORT') {
      return next.handle().pipe(
        mergeMap(async (result: unknown) => {
          await this.audit.record({
            action,
            entity: options.entity,
            entityId: paramId ?? ALL_ENTITIES_ID,
            after: { filtros: request.query },
          });
          return result;
        }),
      );
    }

    return defer(() =>
      this.txHost.withTransaction(() => this.runInTransaction(next, options, action, paramId)),
    );
  }

  private async runInTransaction(
    next: CallHandler,
    options: AuditOptions,
    action: AuditAction,
    paramId: string | undefined,
  ): Promise<unknown> {
    const before =
      action === 'CREATE' ? null : await this.loadBefore(options.model ?? options.entity, paramId);
    const result: unknown = await lastValueFrom(next.handle(), { defaultValue: undefined });

    await this.audit.record({
      action,
      entity: options.entity,
      entityId: resolveEntityId(action, paramId, result, options.entity),
      before,
      after: action === 'DELETE' ? null : result,
    });
    return result;
  }

  private async loadBefore(model: string, id: string | undefined): Promise<unknown> {
    if (!id || !UUID.test(id)) return null;

    const delegateName = model.charAt(0).toLowerCase() + model.slice(1);
    const delegate = (this.txHost.tx as unknown as Record<string, Partial<FindUniqueDelegate>>)[
      delegateName
    ];
    if (typeof delegate?.findUnique !== 'function') {
      throw new Error(`@Audit: model Prisma "${model}" não encontrado. Informe "model".`);
    }
    return delegate.findUnique({ where: { id } });
  }
}

function resolveEntityId(
  action: AuditAction,
  paramId: string | undefined,
  result: unknown,
  entity: string,
): string {
  const resultId = (result as { id?: unknown } | null | undefined)?.id;
  const entityId = action === 'CREATE' ? resultId : (paramId ?? resultId);
  if (typeof entityId !== 'string' && typeof entityId !== 'number') {
    // Erro de programação: desfaz a transação em vez de gravar sem auditoria.
    throw new Error(
      `@Audit(${entity}): o handler de ${action} precisa retornar a entidade com id.`,
    );
  }
  return String(entityId);
}
