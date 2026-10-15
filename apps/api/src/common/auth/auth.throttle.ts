import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { AuthConfig } from './auth.config';

/** Limite do login. */
export const THROTTLE_LOGIN = 'login';
/** Limite do "esqueci a senha" e da redefinição. */
export const THROTTLE_SENHA = 'senha';

const UM_MINUTO_MS = 60_000;

/**
 * Rate limit por IP (CLAUDE.md, seção 6), só nas rotas com `ThrottlerGuard` (as de auth).
 * O IP real chega pelo `X-Forwarded-For` do proxy (ver `trust proxy` em `setupApp`).
 */
export function throttlerOptions(config: AuthConfig): ThrottlerModuleOptions {
  return [
    { name: THROTTLE_LOGIN, ttl: UM_MINUTO_MS, limit: config.loginLimitPorMinuto },
    { name: THROTTLE_SENHA, ttl: UM_MINUTO_MS, limit: config.senhaLimitPorMinuto },
  ];
}
