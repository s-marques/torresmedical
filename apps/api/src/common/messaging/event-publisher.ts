import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { ANONYMOUS_USER_ID, SYSTEM_USER_ID } from '../audit/audit.constants';
import { RequestContextService } from '../context/request-context.service';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import { createEnvelope, findSensitiveKey, type MessageEnvelope } from './message-envelope';
import { assertRoutingKey } from './messaging-names';
import { OutboxRelay } from './outbox-relay';

export interface PublishOptions {
  /** Padrão: usuário do contexto; `system` fora de HTTP. */
  userId?: string;
  /** Versão do contrato do payload. Padrão: 1. */
  version?: number;
}

/**
 * Publica eventos e comandos (CLAUDE.md, seção 5). Grava na outbox com `this.txHost.tx`:
 * dentro de uma transação (ex.: endpoint com `@Audit`), o evento só sai se ela for commitada.
 * O `OutboxRelay` entrega ao RabbitMQ, no exchange `torres.<modulo>` do primeiro segmento.
 *
 * ```ts
 * await this.events.publish('comercial.venda.paga', { vendaId: venda.id });
 * ```
 */
@Injectable()
export class EventPublisher {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly context: RequestContextService,
    private readonly relay: OutboxRelay,
  ) {}

  async publish<P extends object>(
    type: string,
    payload: P,
    options: PublishOptions = {},
  ): Promise<MessageEnvelope<P>> {
    assertRoutingKey(type);
    const sensitive = findSensitiveKey(payload);
    if (sensitive) {
      throw new Error(
        `O payload de "${type}" tem o campo "${sensitive}", que é dado pessoal. Envie só ids.`,
      );
    }

    const envelope = toJson(
      createEnvelope(type, payload, {
        userId: options.userId ?? this.currentUserId(),
        version: options.version,
      }),
    );
    await this.txHost.tx.outboxEvent.create({
      data: { id: envelope.eventId, type, envelope: envelope as unknown as Prisma.InputJsonObject },
    });
    // Fora de transação a linha já está commitada: publica sem esperar a próxima varredura.
    if (!this.txHost.isTransactionActive()) this.relay.trigger();
    return envelope;
  }

  private currentUserId(): string {
    const userId = this.context.getUserId();
    if (userId) return userId;
    return this.context.getRequestId() ? ANONYMOUS_USER_ID : SYSTEM_USER_ID;
  }
}

/** O payload segue como JSON: datas viram texto ISO, `undefined` some. */
function toJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
