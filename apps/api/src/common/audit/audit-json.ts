import type { Prisma } from '../../generated/prisma/client';

/**
 * Chaves de credencial que nunca vão para o audit_log (CLAUDE.md, seção 4):
 * password*, senha*, *token, *secret e *secretKey, sem diferenciar maiúsculas.
 * "secret" só no fim para não pegar campos de domínio como `secretariaId`.
 */
const CREDENTIAL_KEY = /^(password|senha)|(token|secret|secretkey)$/i;

export function isCredentialKey(key: string): boolean {
  return CREDENTIAL_KEY.test(key);
}

type JsonValue = Prisma.InputJsonValue | null;

/**
 * Converte um valor para gravar em jsonb, removendo credenciais em qualquer nível.
 * Datas viram ISO (via toJSON), Decimal vira string e BigInt vira string.
 * Retorna null para valores ausentes.
 */
export function toAuditJson(value: unknown): JsonValue {
  return convert(value, new Set());
}

function convert(value: unknown, ancestors: Set<object>): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'object') return null;
  if (hasToJson(value)) return convert(value.toJSON(), ancestors);
  if (ancestors.has(value)) return '[Circular]';

  ancestors.add(value);
  const result = Array.isArray(value)
    ? value.map((item) => convert(item, ancestors))
    : convertObject(value as Record<string, unknown>, ancestors);
  ancestors.delete(value);
  return result;
}

function convertObject(
  value: Record<string, unknown>,
  ancestors: Set<object>,
): Prisma.InputJsonObject {
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || typeof item === 'function' || isCredentialKey(key)) continue;
    result[key] = convert(item, ancestors);
  }
  return result;
}

function hasToJson(value: object): value is { toJSON: () => unknown } {
  return typeof (value as { toJSON?: unknown }).toJSON === 'function';
}
