import { Prisma } from '../../generated/prisma/client';
import { isCredentialKey, toAuditJson } from './audit-json';

describe('isCredentialKey', () => {
  it.each([
    'password',
    'passwordHash',
    'PASSWORD_HASH',
    'senha',
    'senhaHash',
    'token',
    'accessToken',
    'refreshToken',
    'secret',
    'clientSecret',
    'apiSecretKey',
  ])('reconhece "%s" como credencial', (key) => {
    expect(isCredentialKey(key)).toBe(true);
  });

  it.each(['nome', 'email', 'secretariaId', 'tokenizacao', 'id', 'ativo'])('mantém "%s"', (key) => {
    expect(isCredentialKey(key)).toBe(false);
  });
});

describe('toAuditJson', () => {
  it('retorna null para valores ausentes', () => {
    expect(toAuditJson(undefined)).toBeNull();
    expect(toAuditJson(null)).toBeNull();
  });

  it('remove credenciais em qualquer nível, inclusive em arrays', () => {
    const json = toAuditJson({
      id: '1',
      passwordHash: 'x',
      perfil: { nome: 'Admin', token: 'y', integracoes: [{ clientSecret: 'z', ativo: true }] },
    });

    expect(json).toEqual({
      id: '1',
      perfil: { nome: 'Admin', integracoes: [{ ativo: true }] },
    });
  });

  it('converte Date, Decimal e BigInt para tipos de JSON', () => {
    const json = toAuditJson({
      criadoEm: new Date('2026-10-14T12:00:00.000Z'),
      valor: new Prisma.Decimal('10.50'),
      contador: 10n,
    });

    expect(json).toEqual({ criadoEm: '2026-10-14T12:00:00.000Z', valor: '10.5', contador: '10' });
  });

  it('descarta undefined e funções; números não finitos viram null', () => {
    const json = toAuditJson({ a: undefined, b: () => 1, c: Number.NaN, d: [undefined, 1] });

    expect(json).toEqual({ c: null, d: [null, 1] });
  });

  it('mantém primitivos', () => {
    expect(toAuditJson('texto')).toBe('texto');
    expect(toAuditJson(0)).toBe(0);
    expect(toAuditJson(false)).toBe(false);
    expect(toAuditJson(Symbol('x'))).toBeNull();
  });

  it('não entra em loop com referência circular, mas aceita referência repetida', () => {
    const compartilhado = { id: 'x' };
    const circular: Record<string, unknown> = { id: '1', a: compartilhado, b: compartilhado };
    circular.self = circular;

    expect(toAuditJson(circular)).toEqual({
      id: '1',
      a: { id: 'x' },
      b: { id: 'x' },
      self: '[Circular]',
    });
  });
});
