import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../generated/prisma/client';
import type { RequestContextService } from '../context/request-context.service';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import { AuditService } from './audit.service';

function setup(context: { userId?: string; requestId?: string; ip?: string } = {}) {
  const auditLog = {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };
  const txHost = { tx: { auditLog } } as unknown as TransactionHost<PrismaAdapter>;
  const requestContext = {
    getUserId: () => context.userId,
    getRequestId: () => context.requestId,
    getIp: () => context.ip,
  } as RequestContextService;
  return { service: new AuditService(txHost, requestContext), auditLog };
}

describe('AuditService.record', () => {
  it('grava com usuário, requestId e ip do contexto, sem credenciais', async () => {
    const { service, auditLog } = setup({ userId: 'u-1', requestId: 'req-1', ip: '10.0.0.1' });

    await service.record({
      action: 'UPDATE',
      entity: 'Empresa',
      entityId: 'e-1',
      before: { nome: 'A', passwordHash: 'x' },
      after: { nome: 'B', token: 'y' },
    });

    expect(auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'u-1',
        action: 'UPDATE',
        entity: 'Empresa',
        entityId: 'e-1',
        before: { nome: 'A' },
        after: { nome: 'B' },
        requestId: 'req-1',
        ip: '10.0.0.1',
      },
    });
  });

  it('usa SQL NULL para before/after ausentes', async () => {
    const { service, auditLog } = setup();

    await service.record({ action: 'CREATE', entity: 'Job', entityId: '1' });

    const { data } = auditLog.create.mock.calls[0][0];
    expect(data.before).toBe(Prisma.DbNull);
    expect(data.after).toBe(Prisma.DbNull);
    expect(data.requestId).toBeNull();
    expect(data.ip).toBeNull();
  });

  it.each([
    ['system', 'fora de HTTP', {}],
    ['anonymous', 'em HTTP sem usuário', { requestId: 'req-1' }],
    ['u-9', 'com usuário autenticado', { requestId: 'req-1', userId: 'u-9' }],
  ])('usa "%s" %s', async (esperado, _caso, context) => {
    const { service, auditLog } = setup(context);

    await service.record({ action: 'DELETE', entity: 'Job', entityId: '1' });

    expect(auditLog.create.mock.calls[0][0].data.userId).toBe(esperado);
  });

  it('respeita o userId informado (ex.: usuário do evento da fila)', async () => {
    const { service, auditLog } = setup({ userId: 'u-1' });

    await service.record({ action: 'CREATE', entity: 'Job', entityId: '1', userId: 'u-evento' });

    expect(auditLog.create.mock.calls[0][0].data.userId).toBe('u-evento');
  });
});

describe('AuditService.findMany', () => {
  it('pagina, ordena do mais recente e aplica filtros e período', async () => {
    const { service, auditLog } = setup();
    const occurredAt = new Date('2026-10-14T12:00:00.000Z');
    auditLog.findMany.mockResolvedValue([{ id: 'a', occurredAt }]);
    auditLog.count.mockResolvedValue(21);
    const de = new Date('2026-10-01T00:00:00.000Z');

    const page = await service.findMany({ page: 3, pageSize: 10, entity: 'Empresa', de });

    const where = { entity: 'Empresa', occurredAt: { gte: de, lte: undefined } };
    expect(auditLog.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining(where),
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      skip: 20,
      take: 10,
    });
    expect(auditLog.count).toHaveBeenCalledWith({ where: expect.objectContaining(where) });
    expect(page).toEqual({
      data: [{ id: 'a', occurredAt: '2026-10-14T12:00:00.000Z' }],
      meta: { page: 3, pageSize: 10, total: 21, totalPages: 3 },
    });
  });

  it('não filtra por data quando o período não é informado', async () => {
    const { service, auditLog } = setup();

    await service.findMany({ page: 1, pageSize: 10 });

    expect(auditLog.findMany.mock.calls[0][0].where.occurredAt).toBeUndefined();
  });
});
