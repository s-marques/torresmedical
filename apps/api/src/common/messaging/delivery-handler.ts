import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Channel, ConsumeMessage } from 'amqplib';
import { parseEnvelope, type MessageEnvelope } from './message-envelope';
import type { BaseConsumer, MessageConsumerOptions } from './message-consumer';
import { MESSAGING_CONFIG, retryDelayMs, type MessagingConfig } from './messaging.config';
import { MessagingConnection } from './messaging.connection';
import { dlqOf, retryQueueOf } from './messaging-names';
import { errorType } from './messaging-errors';
import { ProcessedEventsService } from './processed-events.service';

/** Tentativas que já falharam (gravado ao mandar para a `<fila>.retry`). */
export const ATTEMPTS_HEADER = 'x-attempts';
/** Motivo da ida para a DLQ: tipo do erro, `INVALID_ENVELOPE` ou `INVALID_PAYLOAD`. */
export const ERROR_HEADER = 'x-error';

export interface ConsumerEntry {
  options: MessageConsumerOptions;
  instance: BaseConsumer;
}

export type AckChannel = Pick<Channel, 'ack' | 'nack'>;

export type DeliveryOutcome = 'processed' | 'duplicate' | 'retry' | 'dead-letter' | 'requeued';

/**
 * Trata cada mensagem recebida por um consumidor:
 * - envelope ou payload inválido: DLQ, sem nova tentativa;
 * - já processada por esta fila (`processed_events`): confirma sem chamar `handle`;
 * - erro em `handle`: `<fila>.retry` com espera exponencial (a mensagem volta para a fila
 *   quando expira); na tentativa `maxAttempts`, vai para a `<fila>.dlq`.
 * A mensagem original só é confirmada depois que a cópia (retry/DLQ) foi aceita pelo broker;
 * se isso falhar, ela volta para a fila. O log leva só ids e o tipo do erro, nunca o payload.
 *
 * As esperas usam TTL por mensagem numa fila única: o RabbitMQ só expira a mensagem da
 * frente, então uma espera curta atrás de uma longa pode demorar mais. Nunca se perde.
 */
@Injectable()
export class DeliveryHandler {
  private readonly logger = new Logger(DeliveryHandler.name);

  constructor(
    private readonly connection: MessagingConnection,
    private readonly processedEvents: ProcessedEventsService,
    @Inject(MESSAGING_CONFIG) private readonly config: MessagingConfig,
  ) {}

  async handle(
    channel: AckChannel,
    message: ConsumeMessage,
    { options, instance }: ConsumerEntry,
  ): Promise<DeliveryOutcome> {
    const queue = options.queue;
    const attempt = failedAttempts(message) + 1;
    const parsed = parseEnvelope(message.content);
    const log = {
      queue,
      eventId: parsed?.eventId ?? message.properties.messageId,
      type: parsed?.type ?? message.fields.routingKey,
      attempt,
    };

    if (!parsed) return this.deadLetter(channel, message, log, 'INVALID_ENVELOPE');
    let envelope: MessageEnvelope = parsed;
    if (options.payloadSchema) {
      const payload = options.payloadSchema.safeParse(parsed.payload);
      if (!payload.success) return this.deadLetter(channel, message, log, 'INVALID_PAYLOAD');
      envelope = { ...parsed, payload: payload.data };
    }

    let result: 'processed' | 'duplicate';
    try {
      result = await this.processedEvents.runOnce(queue, envelope, () => instance.handle(envelope));
    } catch (err) {
      if (attempt >= this.config.maxAttempts) {
        return this.deadLetter(channel, message, log, errorType(err));
      }
      return this.retry(channel, message, log, errorType(err));
    }

    if (result === 'duplicate') this.logger.debug(log, 'Mensagem já processada; ignorada');
    safeAck(channel, message);
    return result;
  }

  private async retry(
    channel: AckChannel,
    message: ConsumeMessage,
    log: LogContext,
    error: string,
  ): Promise<DeliveryOutcome> {
    const delay = retryDelayMs(log.attempt, this.config);
    const sent = await this.forward(channel, message, retryQueueOf(log.queue), {
      [ATTEMPTS_HEADER]: log.attempt,
      expiration: String(delay),
    });
    if (!sent) return 'requeued';
    this.logger.warn({ ...log, error, retryInMs: delay }, 'Falha ao processar mensagem; retry');
    return 'retry';
  }

  private async deadLetter(
    channel: AckChannel,
    message: ConsumeMessage,
    log: LogContext,
    error: string,
  ): Promise<DeliveryOutcome> {
    const sent = await this.forward(channel, message, dlqOf(log.queue), {
      [ATTEMPTS_HEADER]: log.attempt,
      [ERROR_HEADER]: error,
    });
    if (!sent) return 'requeued';
    this.logger.error({ ...log, error }, 'Mensagem enviada para a DLQ');
    return 'dead-letter';
  }

  /** Copia a mensagem para `queue` e confirma a original; se não der, devolve à fila. */
  private async forward(
    channel: AckChannel,
    message: ConsumeMessage,
    queue: string,
    { expiration, ...headers }: Record<string, string | number>,
  ): Promise<boolean> {
    const { messageId, type, timestamp, headers: original } = message.properties;
    try {
      await this.connection.publish('', queue, message.content, {
        messageId,
        type,
        timestamp,
        expiration,
        headers: { ...stripDeathHeaders(original), ...headers },
      });
    } catch (err) {
      this.logger.warn(
        { queue, eventId: messageId, error: errorType(err) },
        'Não foi possível encaminhar a mensagem; devolvida à fila',
      );
      safeNack(channel, message);
      return false;
    }
    safeAck(channel, message);
    return true;
  }
}

interface LogContext {
  queue: string;
  eventId: unknown;
  type: unknown;
  attempt: number;
}

export function failedAttempts(message: ConsumeMessage): number {
  const value = Number(message.properties.headers?.[ATTEMPTS_HEADER] ?? 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/** Histórico de dead-letter do RabbitMQ: cresce a cada volta do retry e não é usado. */
const DEATH_HEADER = /^x-(death|first-death-|last-death-)/;

function stripDeathHeaders(headers: Record<string, unknown> | undefined): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(([key]) => !DEATH_HEADER.test(key)),
  );
}

/** Com o canal fechado, ack/nack lançam erro: a mensagem é reentregue pelo broker. */
function safeAck(channel: AckChannel, message: ConsumeMessage): void {
  try {
    channel.ack(message);
  } catch {
    // reentregue na reconexão; a idempotência evita processar de novo
  }
}

function safeNack(channel: AckChannel, message: ConsumeMessage): void {
  try {
    channel.nack(message, false, true);
  } catch {
    // reentregue na reconexão
  }
}
