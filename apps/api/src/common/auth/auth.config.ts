export interface AuthConfig {
  /** Segredo de assinatura do access token (HS256). */
  jwtSecret: string;
  /** Validade do access token, em segundos. */
  accessTtlSeconds: number;
  /** Validade da sessão (refresh token), em segundos. */
  refreshTtlSeconds: number;
  /** Validade do link de redefinição de senha, em segundos. */
  resetTtlSeconds: number;
  /** Cookie do refresh token só em HTTPS. Desligue apenas em desenvolvimento sem HTTPS. */
  cookieSecure: boolean;
  /** Tentativas por minuto e por IP no login. */
  loginLimitPorMinuto: number;
  /** Pedidos por minuto e por IP no "esqueci a senha" e na redefinição. */
  senhaLimitPorMinuto: number;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

const MIN_SECRET_LENGTH = 32;

function inteiroPositivo(env: NodeJS.ProcessEnv, nome: string, padrao: number): number {
  const valor = Number(env[nome] ?? padrao);
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new Error(`${nome} deve ser um inteiro positivo.`);
  }
  return valor;
}

/** Lê a configuração da autenticação das variáveis de ambiente e falha cedo se faltar algo. */
export function loadAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const jwtSecret = env.AUTH_JWT_SECRET ?? '';
  if (jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`Defina AUTH_JWT_SECRET com pelo menos ${MIN_SECRET_LENGTH} caracteres.`);
  }
  return {
    jwtSecret,
    accessTtlSeconds: inteiroPositivo(env, 'AUTH_ACCESS_TTL_SECONDS', 15 * 60),
    refreshTtlSeconds: inteiroPositivo(env, 'AUTH_REFRESH_TTL_SECONDS', 7 * 24 * 60 * 60),
    resetTtlSeconds: inteiroPositivo(env, 'AUTH_RESET_TTL_SECONDS', 60 * 60),
    cookieSecure: env.AUTH_COOKIE_SECURE !== 'false',
    loginLimitPorMinuto: inteiroPositivo(env, 'AUTH_LOGIN_LIMIT_PER_MINUTE', 5),
    senhaLimitPorMinuto: inteiroPositivo(env, 'AUTH_PASSWORD_LIMIT_PER_MINUTE', 3),
  };
}
