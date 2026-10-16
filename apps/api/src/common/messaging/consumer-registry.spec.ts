import { Injectable, Logger } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { ChannelModel, ConsumeMessage } from 'amqplib';
import { EventEmitter } from 'node:events';
import { ConsumerRegistry } from './consumer-registry';
import { DeliveryHandler } from './delivery-handler';
import { BaseConsumer, MessageConsumer } from './message-consumer';
import { MESSAGING_CONFIG } from './messaging.config';

@Injectable()
@MessageConsumer({
  queue: 'financeiro.gerar-titulo-venda',
  events: ['comercial.venda.paga', 'compras.compra.recebida'],
})
class TituloConsumer extends BaseConsumer {
  handle = jest.fn().mockResolvedValue(undefined);
}

@Injectable()
@MessageConsumer({ queue: 'financeiro.gerar-titulo-venda', events: ['a.b.c'] })
class MesmaFilaConsumer extends BaseConsumer {
  handle = jest.fn().mockResolvedValue(undefined);
}

@Injectable()
@MessageConsumer({ queue: 'financeiro.outra', events: ['a.b.c'] })
class SemBaseConsumer {
  handle = jest.fn();
}

class CanalFalso extends EventEmitter {
  prefetch = jest.fn().mockResolvedValue({});
  assertQueue = jest.fn().mockResolvedValue({});
  assertExchange = jest.fn().mockResolvedValue({});
  bindQueue = jest.fn().mockResolvedValue({});
  cancel = jest.fn().mockResolvedValue({});
  onMessage?: (msg: ConsumeMessage | null) => void;
  consume = jest.fn(async (_q: string, fn: (msg: ConsumeMessage | null) => void) => {
    this.onMessage = fn;
    return { consumerTag: 'tag-1' };
  });
}

async function setup(providers: unknown[], handle = jest.fn().mockResolvedValue('processed')) {
  const moduleRef = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [
      ...(providers as never[]),
      ConsumerRegistry,
      { provide: DeliveryHandler, useValue: { handle } },
      { provide: MESSAGING_CONFIG, useValue: { prefetch: 10 } },
    ],
  }).compile();
  return { registry: moduleRef.get(ConsumerRegistry), handle };
}

describe('ConsumerRegistry', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('descobre os providers com @MessageConsumer', async () => {
    const { registry } = await setup([TituloConsumer]);

    const [entry] = registry.discover();

    expect(entry?.options.queue).toBe('financeiro.gerar-titulo-venda');
    expect(entry?.instance).toBeInstanceOf(TituloConsumer);
  });

  it('rejeita duas classes na mesma fila e classe que não estende BaseConsumer', async () => {
    const repetida = await setup([TituloConsumer, MesmaFilaConsumer]);
    expect(() => repetida.registry.discover()).toThrow('mais de um consumidor');

    const semBase = await setup([SemBaseConsumer]);
    expect(() => semBase.registry.discover()).toThrow('estende BaseConsumer');
  });

  it('declara fila, retry, DLQ e exchanges, liga os eventos e consome', async () => {
    const { registry, handle } = await setup([TituloConsumer]);
    const [entry] = registry.discover();
    const canal = new CanalFalso();
    const modelo = { createChannel: jest.fn().mockResolvedValue(canal) };

    await registry.start(modelo as unknown as ChannelModel, entry!);

    const fila = 'financeiro.gerar-titulo-venda';
    expect(canal.prefetch).toHaveBeenCalledWith(10);
    expect(canal.assertQueue.mock.calls).toEqual([
      [fila, { durable: true }],
      [`${fila}.retry`, { durable: true, deadLetterExchange: '', deadLetterRoutingKey: fila }],
      [`${fila}.dlq`, { durable: true }],
    ]);
    expect(canal.assertExchange).toHaveBeenCalledWith('torres.comercial', 'topic', {
      durable: true,
    });
    expect(canal.bindQueue.mock.calls).toEqual([
      [fila, 'torres.comercial', 'comercial.venda.paga'],
      [fila, 'torres.compras', 'compras.compra.recebida'],
    ]);

    const msg = { content: Buffer.from('{}') } as ConsumeMessage;
    canal.onMessage?.(msg);
    canal.onMessage?.(null);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith(canal, msg, entry);
  });

  it('stop cancela os consumidores e espera as mensagens em curso', async () => {
    let terminar = (): void => undefined;
    const handle = jest.fn(
      () =>
        new Promise((resolve) => {
          terminar = () => resolve('processed');
        }),
    );
    const { registry } = await setup([TituloConsumer], handle);
    const [entry] = registry.discover();
    const canal = new CanalFalso();
    await registry.start({ createChannel: async () => canal } as unknown as ChannelModel, entry!);
    canal.onMessage?.({ content: Buffer.from('{}') } as ConsumeMessage);

    let parado = false;
    const stop = registry.stop().then(() => (parado = true));
    await new Promise((resolve) => setImmediate(resolve));
    expect(canal.cancel).toHaveBeenCalledWith('tag-1');
    expect(parado).toBe(false);

    terminar();
    await stop;
    expect(parado).toBe(true);
  });

  it('erro inesperado no tratamento vai para o log, sem derrubar o processo', async () => {
    const { registry } = await setup([TituloConsumer], jest.fn().mockRejectedValue(new Error()));
    const [entry] = registry.discover();
    const canal = new CanalFalso();
    await registry.start({ createChannel: async () => canal } as unknown as ChannelModel, entry!);

    canal.onMessage?.({ content: Buffer.from('{}') } as ConsumeMessage);
    await registry.stop();

    expect(Logger.prototype.error).toHaveBeenCalled();
    canal.emit('error', new Error('canal'));
    canal.emit('close');
  });
});
