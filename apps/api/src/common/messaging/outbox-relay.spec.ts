import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { MessagingConfig } from './messaging.config';
import type { MessagingConnection } from './messaging.connection';
import { OutboxRelay } from './outbox-relay';

const CONFIG = { outboxBatchSize: 2, outboxIntervalMs: 1000 } as MessagingConfig;

function linha(id: string, type = 'comercial.venda.paga') {
  return { id, type, envelope: { eventId: id, type, payload: { vendaId: id } } };
}

function setup(lotes: ReturnType<typeof linha>[][], { conectado = true } = {}) {
  const tx = {
    $queryRaw: jest.fn(),
    outboxEvent: { deleteMany: jest.fn(), update: jest.fn() },
  };
  for (const lote of lotes) tx.$queryRaw.mockResolvedValueOnce(lote);
  tx.$queryRaw.mockResolvedValue([]);
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const connection = {
    isConnected: jest.fn(() => conectado),
    publish: jest.fn().mockResolvedValue(undefined),
  };
  const relay = new OutboxRelay(
    prisma as unknown as PrismaService,
    connection as unknown as MessagingConnection,
    CONFIG,
  );
  return { relay, tx, prisma, connection };
}

describe('OutboxRelay', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('publica no exchange do módulo e apaga as linhas confirmadas, em lotes', async () => {
    const { relay, tx, connection } = setup([[linha('1'), linha('2')], [linha('3')]]);

    await expect(relay.flush()).resolves.toBe(3);

    expect(connection.publish).toHaveBeenCalledWith(
      'torres.comercial',
      'comercial.venda.paga',
      Buffer.from(JSON.stringify(linha('1').envelope)),
      { messageId: '1', type: 'comercial.venda.paga' },
    );
    expect(tx.outboxEvent.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ['1', '2'] } },
    });
    expect(tx.outboxEvent.deleteMany).toHaveBeenNthCalledWith(2, { where: { id: { in: ['3'] } } });
    // Lote incompleto: não há mais o que publicar.
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('para no primeiro erro, conta a tentativa e mantém a linha', async () => {
    const { relay, tx, connection } = setup([[linha('1'), linha('2')]]);
    connection.publish.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new TypeError('x'));

    await expect(relay.flush()).resolves.toBe(1);

    expect(tx.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: '2' },
      data: { attempts: { increment: 1 }, lastError: 'TypeError' },
    });
    expect(tx.outboxEvent.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['1'] } } });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('não varre sem conexão com o broker', async () => {
    const { relay, prisma } = setup([[linha('1')]], { conectado: false });

    await expect(relay.flush()).resolves.toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('trigger não sobrepõe varreduras: pedidos durante uma viram uma só, logo depois', async () => {
    const { relay, prisma } = setup([]);
    let liberar = (): void => undefined;
    prisma.$transaction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          liberar = () => resolve({ published: 0, done: true });
        }),
    );

    relay.start();
    relay.trigger();
    relay.trigger();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    liberar();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await relay.stop();
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('varre periodicamente após o start e para no stop', async () => {
    jest.useFakeTimers();
    const { relay, prisma } = setup([]);

    relay.start();
    await jest.advanceTimersByTimeAsync(CONFIG.outboxIntervalMs * 3);
    const chamadas = prisma.$transaction.mock.calls.length;
    expect(chamadas).toBeGreaterThanOrEqual(3);

    await relay.stop();
    await jest.advanceTimersByTimeAsync(CONFIG.outboxIntervalMs * 3);
    expect(prisma.$transaction.mock.calls.length).toBe(chamadas);
  });

  it('registra a falha da varredura sem derrubar o processo', async () => {
    const { relay, prisma } = setup([]);
    prisma.$transaction.mockRejectedValueOnce(new Error('banco fora'));

    relay.trigger();
    await relay.stop();

    expect(Logger.prototype.warn).toHaveBeenCalledWith({ error: 'Error' }, expect.any(String));
  });
});
