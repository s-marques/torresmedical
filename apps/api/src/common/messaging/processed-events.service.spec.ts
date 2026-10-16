import type { TransactionHost } from '@nestjs-cls/transactional';
import type { ClsService } from 'nestjs-cls';
import type { RequestContextService } from '../context/request-context.service';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import { createEnvelope } from './message-envelope';
import { ProcessedEventsService } from './processed-events.service';

function setup(inseridos = 1) {
  const processedEvent = {
    createMany: jest.fn().mockResolvedValue({ count: inseridos }),
    deleteMany: jest.fn().mockResolvedValue({ count: 7 }),
  };
  const txHost = {
    tx: { processedEvent },
    withTransaction: jest.fn((fn: () => Promise<unknown>) => fn()),
  } as unknown as TransactionHost<PrismaAdapter>;
  const cls = { run: jest.fn((fn: () => unknown) => fn()) } as unknown as ClsService;
  const context = { setUserId: jest.fn() } as unknown as RequestContextService;
  return {
    service: new ProcessedEventsService(cls, txHost, context),
    processedEvent,
    txHost,
    context,
  };
}

const envelope = createEnvelope('comercial.venda.paga', { vendaId: 'v-1' }, { userId: 'u-1' });

describe('ProcessedEventsService', () => {
  it('registra o evento e processa numa transação, com o usuário do envelope no contexto', async () => {
    const { service, processedEvent, txHost, context } = setup();
    const handler = jest.fn().mockResolvedValue(undefined);

    await expect(service.runOnce('financeiro.titulos', envelope, handler)).resolves.toBe(
      'processed',
    );

    expect(context.setUserId).toHaveBeenCalledWith('u-1');
    expect(txHost.withTransaction).toHaveBeenCalled();
    expect(processedEvent.createMany).toHaveBeenCalledWith({
      data: [{ eventId: envelope.eventId, consumer: 'financeiro.titulos' }],
      skipDuplicates: true,
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('não chama o handler para evento já processado pela fila', async () => {
    const { service } = setup(0);
    const handler = jest.fn();

    await expect(service.runOnce('financeiro.titulos', envelope, handler)).resolves.toBe(
      'duplicate',
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('propaga o erro do handler (a transação desfaz o registro)', async () => {
    const { service } = setup();

    await expect(
      service.runOnce('financeiro.titulos', envelope, () => Promise.reject(new Error('x'))),
    ).rejects.toThrow('x');
  });

  it('apaga os registros fora da janela de retenção', async () => {
    const { service, processedEvent } = setup();

    await expect(service.purge(30, new Date('2026-10-31T00:00:00.000Z'))).resolves.toBe(7);
    expect(processedEvent.deleteMany).toHaveBeenCalledWith({
      where: { processedAt: { lt: new Date('2026-10-01T00:00:00.000Z') } },
    });
  });
});
