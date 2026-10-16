import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { RequestContextService } from '../context/request-context.service';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import type { MessageEnvelope } from './message-envelope';

export type ProcessResult = 'processed' | 'duplicate';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Idempotência dos consumidores: cada `eventId` é processado uma vez por fila. */
@Injectable()
export class ProcessedEventsService {
  constructor(
    private readonly cls: ClsService,
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly context: RequestContextService,
  ) {}

  /**
   * Roda `handler` numa transação junto com o registro em `processed_events`. Se o evento já
   * foi processado por esta fila, não chama o handler. Se o handler falhar, desfaz o registro.
   * O contexto (CLS) tem o `userId` do envelope, usado pela auditoria.
   */
  runOnce(
    consumer: string,
    envelope: MessageEnvelope,
    handler: () => Promise<void>,
  ): Promise<ProcessResult> {
    return this.cls.run(() => {
      this.context.setUserId(envelope.userId);
      return this.txHost.withTransaction(async (): Promise<ProcessResult> => {
        const { count } = await this.txHost.tx.processedEvent.createMany({
          data: [{ eventId: envelope.eventId, consumer }],
          skipDuplicates: true,
        });
        if (count === 0) return 'duplicate';
        await handler();
        return 'processed';
      });
    });
  }

  /** Apaga os registros mais antigos que a janela de idempotência. */
  async purge(retentionDays: number, now = new Date()): Promise<number> {
    const { count } = await this.txHost.tx.processedEvent.deleteMany({
      where: { processedAt: { lt: new Date(now.getTime() - retentionDays * DAY_MS) } },
    });
    return count;
  }
}
