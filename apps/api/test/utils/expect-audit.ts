import type { AuditAction, AuditLog } from '../../src/generated/prisma/client';
import type { PrismaService } from '../../src/common/prisma/prisma.service';

export interface ExpectedAudit {
  action: AuditAction;
  entity: string;
  entityId: string;
  /** Comparado com `toMatchObject`; use `null` para exigir coluna nula. */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  userId?: string;
  requestId?: string;
}

/**
 * Confere o registro mais recente do audit_log para a entidade/ação e o retorna.
 * Uso obrigatório no e2e de todo endpoint de escrita (CLAUDE.md, seção 4).
 */
export async function expectAudit(
  prisma: PrismaService,
  expected: ExpectedAudit,
): Promise<AuditLog> {
  const { action, entity, entityId, before, after, userId, requestId } = expected;
  const registros = await prisma.auditLog.findMany({
    where: { action, entity, entityId },
    orderBy: { occurredAt: 'desc' },
  });

  expect(registros).toHaveLength(1);
  const registro = registros[0] as AuditLog;
  if (before !== undefined) expectJson(registro.before, before);
  if (after !== undefined) expectJson(registro.after, after);
  if (userId !== undefined) expect(registro.userId).toBe(userId);
  if (requestId !== undefined) expect(registro.requestId).toBe(requestId);
  return registro;
}

/** Garante que nada foi auditado para a entidade (ex.: handler que falhou). */
export async function expectNoAudit(
  prisma: PrismaService,
  where: { entity: string; entityId?: string; action?: AuditAction },
): Promise<void> {
  expect(await prisma.auditLog.count({ where })).toBe(0);
}

function expectJson(actual: unknown, expected: Record<string, unknown> | null): void {
  if (expected === null) expect(actual).toBeNull();
  else expect(actual).toMatchObject(expected);
}
