import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { SENSITIVE_KEYS } from '../logger/redact';
import { ROUTING_KEY_PATTERN } from './messaging-names';

/** Envelope de toda mensagem (CLAUDE.md, seção 5). O payload leva ids, nunca dados pessoais. */
export interface MessageEnvelope<P = unknown> {
  eventId: string;
  /** Routing key: `<modulo>.<entidade>.<acao>`. */
  type: string;
  /** ISO 8601 (UTC). */
  occurredAt: string;
  /** Usuário que originou a mensagem, ou `system`. */
  userId: string;
  payload: P;
  /** Versão do contrato do payload. Mudança incompatível = nova versão. */
  version: number;
}

export const messageEnvelopeSchema = z.object({
  eventId: z.uuid(),
  type: z.string().regex(ROUTING_KEY_PATTERN),
  occurredAt: z.iso.datetime(),
  userId: z.string().min(1),
  payload: z.unknown(),
  version: z.number().int().positive(),
});

export function createEnvelope<P>(
  type: string,
  payload: P,
  options: { userId: string; version?: number },
): MessageEnvelope<P> {
  return {
    eventId: randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    userId: options.userId,
    payload,
    version: options.version ?? 1,
  };
}

/** Lê o envelope do corpo da mensagem. Devolve `undefined` se não for um envelope válido. */
export function parseEnvelope(content: Buffer): MessageEnvelope | undefined {
  let json: unknown;
  try {
    json = JSON.parse(content.toString('utf8'));
  } catch {
    return undefined;
  }
  const result = messageEnvelopeSchema.safeParse(json);
  return result.success ? (result.data as MessageEnvelope) : undefined;
}

const SENSITIVE = new Set<string>(SENSITIVE_KEYS.map((key) => key.toLowerCase()));

/**
 * Primeiro campo com nome de dado pessoal no payload (em qualquer nível), ou `undefined`.
 * Usa a mesma lista da redaction do logger.
 */
export function findSensitiveKey(value: unknown, path = ''): string | undefined {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findSensitiveKey(item, `${path}[${index}]`);
      if (found) return found;
    }
    return undefined;
  }
  if (value === null || typeof value !== 'object') return undefined;

  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (SENSITIVE.has(key.toLowerCase())) return childPath;
    const found = findSensitiveKey(child, childPath);
    if (found) return found;
  }
  return undefined;
}
