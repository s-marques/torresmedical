import { Logger } from '@nestjs/common';
import type { ConsumeMessage } from 'amqplib';
import { z } from 'zod';
import { ATTEMPTS_HEADER, DeliveryHandler, ERROR_HEADER, failedAttempts } from './delivery-handler';
import { createEnvelope, type MessageEnvelope } from './message-envelope';
import { BaseConsumer } from './message-consumer';
import type { MessagingConfig } from './messaging.config';
import type { MessagingConnection } from './messaging.connection';
import type { ProcessedEventsService } from './processed-events.service';

const QUEUE = 'financeiro.gerar-titulo-venda';
const CONFIG = { maxAttempts: 3, retryBaseDelayMs: 100, retryMaxDelayMs: 1000 } as MessagingConfig;

class ConsumidorTeste extends BaseConsumer<{ vendaId: string }> {
  readonly handle = jest.fn<Promise<void>, [MessageEnvelope<{ vendaId: string }>]>();
}

function mensagem(content: unknown, headers: Record<string, unknown> = {}): ConsumeMessage {
  const body = typeof content === 'string' ? content : JSON.stringify(content);
  return {
    content: Buffer.from(body),
    fields: { routingKey: 'comercial.venda.paga' },
    properties: { messageId: 'm-1', type: 'comercial.venda.paga', timestamp: 1, headers },
  } as unknown as ConsumeMessage;
}

function setup({ duplicado = false, publicacaoFalha = false } = {}) {
  const connection = {
    publish: publicacaoFalha
      ? jest.fn().mockRejectedValue(new Error('fora'))
      : jest.fn().mockResolvedValue(undefined),
  };
  const processed = {
    runOnce: jest.fn(async (_queue: string, _env: MessageEnvelope, fn: () => Promise<void>) => {
      if (duplicado) return 'duplicate';
      await fn();
      return 'processed';
    }),
  };
  const handler = new DeliveryHandler(
    connection as unknown as MessagingConnection,
    processed as unknown as ProcessedEventsService,
    CONFIG,
  );
  const channel = { ack: jest.fn(), nack: jest.fn() };
  const consumidor = new ConsumidorTeste();
  const entry = {
    options: { queue: QUEUE, events: ['comercial.venda.paga'] },
    instance: consumidor,
  };
  return { handler, connection, processed, channel, consumidor, entry };
}

const envelope = createEnvelope('comercial.venda.paga', { vendaId: 'v-1' }, { userId: 'u-1' });

describe('DeliveryHandler', () => {
  let logError: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('processa e confirma a mensagem', async () => {
    const { handler, channel, consumidor, entry, processed } = setup();
    const msg = mensagem(envelope);

    await expect(handler.handle(channel, msg, entry)).resolves.toBe('processed');

    expect(processed.runOnce).toHaveBeenCalledWith(QUEUE, envelope, expect.any(Function));
    expect(consumidor.handle).toHaveBeenCalledWith(envelope);
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('confirma sem processar a mensagem duplicada', async () => {
    const { handler, channel, consumidor, entry } = setup({ duplicado: true });

    await expect(handler.handle(channel, mensagem(envelope), entry)).resolves.toBe('duplicate');

    expect(consumidor.handle).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalled();
  });

  it('na falha, manda para a fila de retry com espera exponencial', async () => {
    const { handler, channel, consumidor, entry, connection } = setup();
    consumidor.handle.mockRejectedValue(new TypeError('falhou'));
    const msg = mensagem(envelope, { [ATTEMPTS_HEADER]: 1, 'x-death': [{}], outro: 'a' });

    await expect(handler.handle(channel, msg, entry)).resolves.toBe('retry');

    expect(connection.publish).toHaveBeenCalledWith('', `${QUEUE}.retry`, msg.content, {
      messageId: 'm-1',
      type: 'comercial.venda.paga',
      timestamp: 1,
      expiration: '200',
      headers: { outro: 'a', [ATTEMPTS_HEADER]: 2 },
    });
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('na última tentativa, manda para a DLQ com o tipo do erro', async () => {
    const { handler, channel, consumidor, entry, connection } = setup();
    consumidor.handle.mockRejectedValue(new TypeError('dado pessoal aqui'));

    await expect(
      handler.handle(channel, mensagem(envelope, { [ATTEMPTS_HEADER]: 2 }), entry),
    ).resolves.toBe('dead-letter');

    const [, fila, , opcoes] = connection.publish.mock.calls[0];
    expect(fila).toBe(`${QUEUE}.dlq`);
    expect(opcoes.headers).toEqual({ [ATTEMPTS_HEADER]: 3, [ERROR_HEADER]: 'TypeError' });
    expect(opcoes.expiration).toBeUndefined();
    // O log leva ids e o tipo do erro, nunca a mensagem do erro nem o payload.
    const logado = JSON.stringify(logError.mock.calls);
    expect(logado).toContain(envelope.eventId);
    expect(logado).not.toContain('dado pessoal aqui');
    expect(logado).not.toContain('v-1');
  });

  it('envelope inválido vai direto para a DLQ, sem processar', async () => {
    const { handler, channel, entry, connection, processed } = setup();

    await expect(handler.handle(channel, mensagem('não é json'), entry)).resolves.toBe(
      'dead-letter',
    );

    expect(processed.runOnce).not.toHaveBeenCalled();
    expect(connection.publish.mock.calls[0][3].headers[ERROR_HEADER]).toBe('INVALID_ENVELOPE');
  });

  it('valida o payload com o schema do consumidor e entrega o valor validado', async () => {
    const { handler, channel, entry, consumidor, connection } = setup();
    const comSchema = {
      ...entry,
      options: {
        ...entry.options,
        payloadSchema: z.object({ vendaId: z.string().transform((v) => v.toUpperCase()) }),
      },
    };

    await handler.handle(channel, mensagem(envelope), comSchema);
    expect(consumidor.handle).toHaveBeenCalledWith({ ...envelope, payload: { vendaId: 'V-1' } });

    const invalido = createEnvelope('comercial.venda.paga', { outro: 1 }, { userId: 'u' });
    await expect(handler.handle(channel, mensagem(invalido), comSchema)).resolves.toBe(
      'dead-letter',
    );
    expect(connection.publish.mock.calls[0][3].headers[ERROR_HEADER]).toBe('INVALID_PAYLOAD');
  });

  it('se não conseguir encaminhar, devolve a mensagem à fila', async () => {
    const { handler, channel, consumidor, entry } = setup({ publicacaoFalha: true });
    consumidor.handle.mockRejectedValue(new Error('x'));
    const msg = mensagem(envelope);

    await expect(handler.handle(channel, msg, entry)).resolves.toBe('requeued');

    expect(channel.nack).toHaveBeenCalledWith(msg, false, true);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('não quebra se o canal já fechou ao confirmar', async () => {
    const { handler, channel, entry } = setup();
    channel.ack.mockImplementation(() => {
      throw new Error('Channel closed');
    });

    await expect(handler.handle(channel, mensagem(envelope), entry)).resolves.toBe('processed');
  });
});

describe('failedAttempts', () => {
  it.each([
    [{}, 0],
    [{ [ATTEMPTS_HEADER]: 2 }, 2],
    [{ [ATTEMPTS_HEADER]: 'x' }, 0],
    [{ [ATTEMPTS_HEADER]: -1 }, 0],
  ])('lê o header %j como %d', (headers, esperado) => {
    expect(failedAttempts(mensagem(envelope, headers))).toBe(esperado);
  });
});
