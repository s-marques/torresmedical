import { Inject, Injectable, Logger } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { Channel, ChannelModel } from 'amqplib';
import { DeliveryHandler, type ConsumerEntry } from './delivery-handler';
import { assertConsumerOptions, BaseConsumer, MessageConsumer } from './message-consumer';
import { MESSAGING_CONFIG, type MessagingConfig } from './messaging.config';
import { dlqOf, exchangeOf, retryQueueOf } from './messaging-names';
import { errorType } from './messaging-errors';

interface ActiveConsumer {
  channel: Channel;
  consumerTag: string;
}

/**
 * Encontra os providers com `@MessageConsumer`, monta a topologia de cada fila e consome.
 * `start` roda a cada (re)conexão; `stop` para de receber e espera as mensagens em curso.
 */
@Injectable()
export class ConsumerRegistry {
  private readonly logger = new Logger(ConsumerRegistry.name);
  private readonly active = new Set<ActiveConsumer>();
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly delivery: DeliveryHandler,
    @Inject(MESSAGING_CONFIG) private readonly config: MessagingConfig,
  ) {}

  discover(): ConsumerEntry[] {
    const entries = this.discovery
      .getProviders({ metadataKey: MessageConsumer.KEY })
      .map((wrapper): ConsumerEntry => {
        const options = this.discovery.getMetadataByDecorator(MessageConsumer, wrapper);
        const instance: unknown = wrapper.instance;
        if (!options || !(instance instanceof BaseConsumer)) {
          throw new Error(
            `${wrapper.name}: @MessageConsumer exige uma classe que estende BaseConsumer.`,
          );
        }
        assertConsumerOptions(options);
        return { options, instance };
      });

    const queues = entries.map((entry) => entry.options.queue);
    const repeated = queues.find((queue, index) => queues.indexOf(queue) !== index);
    if (repeated) throw new Error(`A fila "${repeated}" tem mais de um consumidor.`);
    return entries;
  }

  async start(model: ChannelModel, entry: ConsumerEntry): Promise<void> {
    const { queue, events, prefetch } = entry.options;
    const channel = await model.createChannel();
    channel.on('error', (err: Error) => {
      this.logger.warn({ queue, error: err.message }, 'Erro no canal do consumidor');
    });

    await channel.prefetch(prefetch ?? this.config.prefetch);
    await channel.assertQueue(queue, { durable: true });
    // Espera do retry: quando a mensagem expira, o RabbitMQ a devolve para a fila principal.
    await channel.assertQueue(retryQueueOf(queue), {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: queue,
    });
    await channel.assertQueue(dlqOf(queue), { durable: true });
    for (const event of events) {
      const exchange = exchangeOf(event);
      await channel.assertExchange(exchange, 'topic', { durable: true });
      await channel.bindQueue(queue, exchange, event);
    }

    const { consumerTag } = await channel.consume(queue, (message) => {
      if (!message) return;
      const work = this.delivery.handle(channel, message, entry).catch((err: unknown) => {
        this.logger.error({ queue, error: errorType(err) }, 'Erro inesperado ao tratar mensagem');
      });
      this.inFlight.add(work);
      void work.finally(() => this.inFlight.delete(work));
    });
    const active = { channel, consumerTag };
    this.active.add(active);
    channel.once('close', () => this.active.delete(active));
  }

  async stop(): Promise<void> {
    await Promise.allSettled(
      [...this.active].map(({ channel, consumerTag }) => channel.cancel(consumerTag)),
    );
    await Promise.allSettled([...this.inFlight]);
  }
}
