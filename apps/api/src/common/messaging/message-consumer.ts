import { DiscoveryService } from '@nestjs/core';
import type { ZodType } from 'zod';
import type { MessageEnvelope } from './message-envelope';
import { assertQueueName, assertRoutingKey } from './messaging-names';

export interface MessageConsumerOptions {
  /** Fila `<modulo-consumidor>.<proposito>`, ex.: `financeiro.gerar-titulo-venda`. */
  queue: string;
  /** Eventos/comandos (routing keys) que a fila recebe, ex.: `['comercial.venda.paga']`. */
  events: readonly string[];
  /** Valida o payload. Payload inválido vai direto para a DLQ, sem nova tentativa. */
  payloadSchema?: ZodType;
  /** Sobrescreve `MESSAGING_PREFETCH` para esta fila. */
  prefetch?: number;
  /**
   * Tempo máximo da transação do `handle` (padrão do Prisma: 5 s). Só para consumidores pesados,
   * como a exportação em lote, que demoram mais que isso.
   */
  transactionTimeoutMs?: number;
}

/**
 * Registra um consumidor de fila. A classe estende `BaseConsumer` e é um provider de um módulo.
 * O `MessagingModule` declara a fila, a `<fila>.retry` e a `<fila>.dlq`, liga a fila aos
 * eventos e entrega cada mensagem a `handle`, com idempotência, retry com backoff e DLQ.
 *
 * ```ts
 * @MessageConsumer({ queue: 'financeiro.gerar-titulo-venda', events: ['comercial.venda.paga'] })
 * export class GerarTituloVendaConsumer extends BaseConsumer<{ vendaId: string }> { ... }
 * ```
 */
export const MessageConsumer = DiscoveryService.createDecorator<MessageConsumerOptions>();

/**
 * Base dos consumidores. `handle` roda numa transação junto com o registro em
 * `processed_events`: se lançar erro, nada é gravado e a mensagem volta para nova tentativa.
 * Use `this.txHost.tx` para o banco e `AuditService.record` para auditar (o usuário do
 * contexto é o `userId` do envelope).
 */
export abstract class BaseConsumer<P = unknown> {
  abstract handle(envelope: MessageEnvelope<P>): Promise<void>;
}

export function assertConsumerOptions(options: MessageConsumerOptions): void {
  assertQueueName(options.queue);
  if (options.events.length === 0) {
    throw new Error(`A fila "${options.queue}" precisa receber ao menos um evento.`);
  }
  options.events.forEach(assertRoutingKey);
}
