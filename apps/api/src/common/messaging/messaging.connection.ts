import { Inject, Injectable, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import type { ChannelModel, ConfirmChannel, Options, RecoveringChannelModel } from 'amqplib';
import { MESSAGING_CONFIG, type MessagingConfig } from './messaging.config';

/** Monta canais e consumidores numa conexão. Roda a cada (re)conexão. */
export type ConnectionSetup = (model: ChannelModel) => Promise<void>;

/** O RabbitMQ está fora: a mensagem não foi publicada. */
export class MessagingUnavailableError extends Error {
  constructor() {
    super('RabbitMQ indisponível.');
    this.name = 'MessagingUnavailableError';
  }
}

/** Tempo máximo esperando a confirmação (publisher confirm) do broker. */
export const PUBLISH_TIMEOUT_MS = 5_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

/**
 * Conexão única com o RabbitMQ, com reconexão automática. A API sobe mesmo com o broker
 * fora: os eventos ficam na outbox e o health mostra `mensageria: 'down'`.
 * Publica por um canal com confirmação: `publish` só resolve quando o broker aceitou.
 */
@Injectable()
export class MessagingConnection {
  private readonly logger = new Logger(MessagingConnection.name);
  private readonly setups: ConnectionSetup[] = [];
  private readonly declaredExchanges = new Set<string>();
  private connection?: RecoveringChannelModel;
  private model?: ChannelModel;
  private publishChannel?: Promise<ConfirmChannel>;
  private connected = false;

  constructor(@Inject(MESSAGING_CONFIG) private readonly config: MessagingConfig) {}

  /** Registra uma montagem de topologia/consumidor. Chame antes de `connect`. */
  onConnect(setup: ConnectionSetup): void {
    this.setups.push(setup);
  }

  /** Inicia a conexão sem esperar o broker (use `waitForConnect` para esperar). */
  async connect(): Promise<void> {
    const connection = await amqp.connect(this.config.url, {
      recovery: {
        waitForConnect: false,
        maxRetries: Infinity,
        maxDelay: RECONNECT_MAX_DELAY_MS,
        setup: (model: ChannelModel) => this.setup(model),
      },
    });
    connection.on('connect', () => {
      this.connected = true;
      this.logger.log('Conectado ao RabbitMQ');
    });
    connection.on('disconnect', (err: Error) => {
      this.connected = false;
      this.logger.warn({ error: err.message }, 'Conexão com o RabbitMQ perdida; reconectando');
    });
    connection.on('connect-failed', (err: Error) => {
      this.logger.warn({ error: err.message }, 'Falha ao conectar ao RabbitMQ; nova tentativa');
    });
    connection.on('error', (err: Error) => {
      this.logger.warn({ error: err.message }, 'Erro na conexão com o RabbitMQ');
    });
    this.connection = connection;
  }

  async waitForConnect(): Promise<void> {
    await this.connection?.waitForConnect();
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Publica e espera a confirmação do broker. Com `exchange` vazio, entrega direto na fila
   * `routingKey` (exchange padrão). Exchanges `torres.*` são declarados no primeiro uso.
   */
  async publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: Options.Publish = {},
  ): Promise<void> {
    const channel = await this.getPublishChannel();
    if (exchange && !this.declaredExchanges.has(exchange)) {
      await channel.assertExchange(exchange, 'topic', { durable: true });
      this.declaredExchanges.add(exchange);
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Sem confirmação do RabbitMQ no prazo.')),
        PUBLISH_TIMEOUT_MS,
      );
      channel.publish(
        exchange,
        routingKey,
        content,
        { persistent: true, contentType: 'application/json', ...options },
        (err: unknown) => {
          clearTimeout(timer);
          if (err) reject(err instanceof Error ? err : new Error('Publicação recusada.'));
          else resolve();
        },
      );
    });
  }

  async close(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    this.connected = false;
    await connection?.close().catch(() => undefined);
  }

  private async setup(model: ChannelModel): Promise<void> {
    this.model = model;
    this.publishChannel = undefined;
    this.declaredExchanges.clear();
    model.once('close', () => this.forget(model));
    try {
      for (const setup of this.setups) await setup(model);
    } catch (err) {
      this.forget(model);
      throw err;
    }
  }

  private forget(model: ChannelModel): void {
    if (this.model !== model) return;
    this.model = undefined;
    this.publishChannel = undefined;
    this.connected = false;
  }

  /** Canal de publicação da conexão atual, recriado se tiver sido fechado por erro. */
  private getPublishChannel(): Promise<ConfirmChannel> {
    const model = this.model;
    if (!model) return Promise.reject(new MessagingUnavailableError());
    this.publishChannel ??= this.createPublishChannel(model);
    return this.publishChannel;
  }

  private async createPublishChannel(model: ChannelModel): Promise<ConfirmChannel> {
    try {
      const channel = await model.createConfirmChannel();
      channel.on('error', (err: Error) => {
        this.logger.warn({ error: err.message }, 'Erro no canal de publicação do RabbitMQ');
      });
      channel.on('close', () => {
        if (this.model !== model) return;
        this.publishChannel = undefined;
        this.declaredExchanges.clear();
      });
      return channel;
    } catch (err) {
      this.publishChannel = undefined;
      throw err;
    }
  }
}
