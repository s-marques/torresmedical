import { createHash, randomBytes } from 'node:crypto';

/** Segredo aleatório de 256 bits em base64url (refresh token e link de redefinição). */
export function gerarSegredo(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hash do token guardado no banco. SHA-256 basta: o token é aleatório e de alta entropia
 * (não é uma senha escolhida por pessoa), e a busca pelo hash precisa ser determinística.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Refresh token: `<sessaoId>.<segredo>`. O id localiza a sessão; o segredo é conferido pelo hash. */
export function montarRefreshToken(sessaoId: string, segredo: string): string {
  return `${sessaoId}.${segredo}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(valor: string): boolean {
  return UUID.test(valor);
}

export function lerRefreshToken(token: string): { sessaoId: string; segredo: string } | null {
  const separador = token.indexOf('.');
  if (separador <= 0) return null;
  const sessaoId = token.slice(0, separador);
  const segredo = token.slice(separador + 1);
  if (!isUuid(sessaoId) || segredo.length === 0) return null;
  return { sessaoId, segredo };
}
