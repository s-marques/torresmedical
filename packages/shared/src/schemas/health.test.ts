import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health';

const VALIDA = {
  status: 'ok',
  uptime: 12.5,
  timestamp: new Date().toISOString(),
  checks: { mensageria: 'up' },
};

describe('healthResponseSchema', () => {
  it('aceita uma resposta válida, com a mensageria no ar ou fora', () => {
    expect(healthResponseSchema.safeParse(VALIDA).success).toBe(true);
    expect(
      healthResponseSchema.safeParse({ ...VALIDA, checks: { mensageria: 'down' } }).success,
    ).toBe(true);
  });

  it('rejeita status diferente de ok', () => {
    expect(healthResponseSchema.safeParse({ ...VALIDA, status: 'down' }).success).toBe(false);
  });

  it('rejeita estado de dependência desconhecido ou ausente', () => {
    expect(
      healthResponseSchema.safeParse({ ...VALIDA, checks: { mensageria: 'talvez' } }).success,
    ).toBe(false);
    expect(healthResponseSchema.safeParse({ ...VALIDA, checks: {} }).success).toBe(false);
  });
});
