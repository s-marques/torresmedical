import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ConsumerRegistry } from './consumer-registry';
import { DeliveryHandler } from './delivery-handler';
import { EventPublisher } from './event-publisher';
import { loadMessagingConfig, MESSAGING_CONFIG, type MessagingConfig } from './messaging.config';
import { MessagingConnection } from './messaging.connection';
import { errorType } from './messaging-errors';
import { OutboxRelay } from './outbox-relay';
import { ProcessedEventsService } from './processed-events.service';

const PURGE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Mensageria com RabbitMQ (CLAUDE.md, seção 5). Exporta o `EventPublisher` (publicação via
 * outbox) e a `MessagingConnection` (health). Os consumidores são providers com
 * `@MessageConsumer` em qualquer módulo, descobertos na inicialização.
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    { provide: MESSAGING_CONFIG, useFactory: () => loadMessagingConfig(process.env) },
    MessagingConnection,
    OutboxRelay,
    EventPublisher,
    ProcessedEventsService,
    DeliveryHandler,
    ConsumerRegistry,
  ],
  exports: [EventPublisher, MessagingConnection],
})
export class MessagingModule implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MessagingModule.name);
  private purgeTimer?: NodeJS.Timeout;

  constructor(
    private readonly connection: MessagingConnection,
    private readonly consumers: ConsumerRegistry,
    private readonly relay: OutboxRelay,
    private readonly processedEvents: ProcessedEventsService,
    @Inject(MESSAGING_CONFIG) private readonly config: MessagingConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const entry of this.consumers.discover()) {
      this.connection.onConnect((model) => this.consumers.start(model, entry));
    }
    await this.connection.connect();
    this.relay.start();
    this.purgeTimer = setInterval(() => void this.purgeProcessedEvents(), PURGE_INTERVAL_MS);
    this.purgeTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.purgeTimer);
    await this.consumers.stop();
    await this.relay.stop();
    await this.connection.close();
  }

  private async purgeProcessedEvents(): Promise<void> {
    try {
      await this.processedEvents.purge(this.config.processedRetentionDays);
    } catch (err) {
      this.logger.warn({ error: errorType(err) }, 'Falha ao limpar processed_events');
    }
  }
}
