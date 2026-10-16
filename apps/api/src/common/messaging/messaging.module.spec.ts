import { Logger } from '@nestjs/common';
import { ConsumerRegistry } from './consumer-registry';
import type { MessagingConfig } from './messaging.config';
import type { MessagingConnection } from './messaging.connection';
import { MessagingModule } from './messaging.module';
import type { OutboxRelay } from './outbox-relay';
import type { ProcessedEventsService } from './processed-events.service';

function setup() {
  const entry = { options: { queue: 'a.b', events: ['a.b.c'] }, instance: {} };
  const connection = {
    onConnect: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const consumers = {
    discover: jest.fn(() => [entry]),
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  };
  const relay = { start: jest.fn(), stop: jest.fn().mockResolvedValue(undefined) };
  const processed = { purge: jest.fn().mockResolvedValue(0) };
  const module = new MessagingModule(
    connection as unknown as MessagingConnection,
    consumers as unknown as ConsumerRegistry,
    relay as unknown as OutboxRelay,
    processed as unknown as ProcessedEventsService,
    { processedRetentionDays: 30 } as MessagingConfig,
  );
  return { module, connection, consumers, relay, processed, entry };
}

describe('MessagingModule', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('registra os consumidores antes de conectar e inicia o relay', async () => {
    const { module, connection, consumers, relay, entry } = setup();

    await module.onApplicationBootstrap();

    expect(connection.onConnect).toHaveBeenCalledTimes(1);
    expect(connection.onConnect.mock.invocationCallOrder[0]).toBeLessThan(
      connection.connect.mock.invocationCallOrder[0] ?? 0,
    );
    const montagem = connection.onConnect.mock.calls[0][0];
    await montagem('modelo');
    expect(consumers.start).toHaveBeenCalledWith('modelo', entry);
    expect(relay.start).toHaveBeenCalled();
    await module.onModuleDestroy();
  });

  it('limpa processed_events de hora em hora, sem derrubar em caso de erro', async () => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { module, processed } = setup();
    processed.purge.mockRejectedValueOnce(new Error('banco fora'));

    await module.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(processed.purge).toHaveBeenCalledWith(30);
    expect(processed.purge).toHaveBeenCalledTimes(2);
    expect(Logger.prototype.warn).toHaveBeenCalledWith({ error: 'Error' }, expect.any(String));
    await module.onModuleDestroy();
  });

  it('no shutdown, para os consumidores, o relay e fecha a conexão, nessa ordem', async () => {
    const { module, connection, consumers, relay } = setup();

    await module.onModuleDestroy();

    const ordem = [consumers.stop, relay.stop, connection.close].map(
      (fn) => fn.mock.invocationCallOrder[0],
    );
    expect(ordem).toEqual([...ordem].sort((a = 0, b = 0) => a - b));
  });
});
