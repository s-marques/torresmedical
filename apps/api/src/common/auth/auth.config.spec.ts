import { loadAuthConfig } from './auth.config';

const SECRET = 's'.repeat(32);

describe('loadAuthConfig', () => {
  it('padrões: access de 15 min, sessão de 7 dias, link de 1 h e cookie Secure', () => {
    expect(loadAuthConfig({ AUTH_JWT_SECRET: SECRET })).toEqual({
      jwtSecret: SECRET,
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604_800,
      resetTtlSeconds: 3600,
      cookieSecure: true,
      loginLimitPorMinuto: 5,
      senhaLimitPorMinuto: 3,
    });
  });

  it('lê os valores das variáveis de ambiente', () => {
    expect(
      loadAuthConfig({
        AUTH_JWT_SECRET: SECRET,
        AUTH_ACCESS_TTL_SECONDS: '60',
        AUTH_COOKIE_SECURE: 'false',
        AUTH_LOGIN_LIMIT_PER_MINUTE: '10',
      }),
    ).toMatchObject({ accessTtlSeconds: 60, cookieSecure: false, loginLimitPorMinuto: 10 });
  });

  it('falha sem segredo forte', () => {
    expect(() => loadAuthConfig({})).toThrow('AUTH_JWT_SECRET');
    expect(() => loadAuthConfig({ AUTH_JWT_SECRET: 'curto' })).toThrow('32 caracteres');
  });

  it('falha com número inválido', () => {
    expect(() => loadAuthConfig({ AUTH_JWT_SECRET: SECRET, AUTH_RESET_TTL_SECONDS: '0' })).toThrow(
      'AUTH_RESET_TTL_SECONDS deve ser um inteiro positivo.',
    );
    expect(() =>
      loadAuthConfig({ AUTH_JWT_SECRET: SECRET, AUTH_REFRESH_TTL_SECONDS: 'abc' }),
    ).toThrow('AUTH_REFRESH_TTL_SECONDS');
  });
});
