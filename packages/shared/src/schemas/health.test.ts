import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health';

describe('healthResponseSchema', () => {
  it('aceita uma resposta válida', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      uptime: 12.5,
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rejeita status diferente de ok', () => {
    const result = healthResponseSchema.safeParse({
      status: 'down',
      uptime: 1,
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
