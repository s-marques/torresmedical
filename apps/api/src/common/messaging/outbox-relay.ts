import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGING_CONFIG, type MessagingConfig } from './messaging.config';
import { MessagingConnection } from './messaging.connection';
import { errorType } from './messaging-errors';
import { exchangeOf } from './messaging-names';

interface OutboxRow {
  id: string;
  type: string;
  envelope: unknown;
}

const TRANSACTION_TIMEOUT_MS = 30_000;

/**
 * Publica no RabbitMQ os eventos da outbox. Só vê linhas commitadas, então o evento sai
 * depois do commit da transação que o gerou. Apaga a linha após a confirmação do broker.
 * Varre a cada `outboxIntervalMs` e também quando o `EventPublisher` grava fora de transação.
 * `FOR UPDATE SKIP LOCKED` evita que duas instâncias publiquem o mesmo evento ao mesmo tempo;
 * se a publicação confirmar e o delete falhar, o evento sai de novo (os consumidores deduplicam).
 */
@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private pending = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly connection: MessagingConnection,
    @Inject(MESSAGING_CONFIG) private readonly config: MessagingConfig,
  ) {}

  start(): void {
    this.timer = setInterval(() => this.trigger(), this.config.outboxIntervalMs);
    this.timer.unref();
    this.trigger();
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    this.pending = false;
    await this.running;
  }

  /** Agenda uma varredura; se já houver uma rodando, roda outra logo depois. */
  trigger(): void {
    if (this.running) {
      this.pending = true;
      return;
    }
    this.running = this.flush()
      .then(() => undefined)
      .catch((err: unknown) => {
        this.logger.warn({ error: errorType(err) }, 'Falha ao varrer a outbox');
      })
      .finally(() => {
        this.running = undefined;
        if (this.pending && this.timer) {
          this.pending = false;
          this.trigger();
        }
      });
  }

  /** Publica os eventos pendentes, em lotes, até esvaziar ou falhar. Devolve quantos saíram. */
  async flush(): Promise<number> {
    let total = 0;
    while (this.connection.isConnected()) {
      const { published, done } = await this.publishBatch();
      total += published;
      if (done) break;
    }
    return total;
  }

  private publishBatch(): Promise<{ published: number; done: boolean }> {
    const batchSize = this.config.outboxBatchSize;
    return this.prisma.$transaction(
      async (tx) => {
        // Quem já falhou vai para o fim da fila, para não travar os demais.
        const rows = await tx.$queryRaw<OutboxRow[]>`
          SELECT id, type, envelope FROM outbox_events
          ORDER BY attempts, created_at, id
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED`;

        const published: string[] = [];
        let failed = false;
        for (const row of rows) {
          try {
            await this.connection.publish(
              exchangeOf(row.type),
              row.type,
              Buffer.from(JSON.stringify(row.envelope)),
              { messageId: row.id, type: row.type },
            );
            published.push(row.id);
          } catch (err) {
            failed = true;
            this.logger.warn(
              { eventId: row.id, type: row.type, error: errorType(err) },
              'Falha ao publicar evento da outbox; nova tentativa na próxima varredura',
            );
            await tx.outboxEvent.update({
              where: { id: row.id },
              data: { attempts: { increment: 1 }, lastError: errorType(err) },
            });
            break;
          }
        }
        if (published.length > 0) {
          await tx.outboxEvent.deleteMany({ where: { id: { in: published } } });
        }
        return { published: published.length, done: failed || rows.length < batchSize };
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  }
}
