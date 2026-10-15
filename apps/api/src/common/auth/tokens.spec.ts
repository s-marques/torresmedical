import { randomUUID } from 'node:crypto';
import { gerarSegredo, hashToken, isUuid, lerRefreshToken, montarRefreshToken } from './tokens';

describe('tokens', () => {
  it('gera segredos aleatórios de 256 bits em base64url', () => {
    const a = gerarSegredo();

    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(gerarSegredo()).not.toBe(a);
  });

  it('hash SHA-256 determinístico em hex', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('monta e lê o refresh token <sessaoId>.<segredo>', () => {
    const id = randomUUID();

    expect(lerRefreshToken(montarRefreshToken(id, 'segredo.com.ponto'))).toEqual({
      sessaoId: id,
      segredo: 'segredo.com.ponto',
    });
  });

  it.each(['', 'sem-ponto', '.segredo', 'nao-uuid.segredo', `${randomUUID()}.`])(
    'recusa refresh token malformado: "%s"',
    (token) => {
      expect(lerRefreshToken(token)).toBeNull();
    },
  );

  it('reconhece uuid', () => {
    expect(isUuid(randomUUID())).toBe(true);
    expect(isUuid('123')).toBe(false);
  });
});
