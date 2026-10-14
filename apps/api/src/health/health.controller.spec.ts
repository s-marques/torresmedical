import { healthResponseSchema } from '@torres/shared';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('retorna status ok no formato do schema compartilhado', () => {
    const result = new HealthController().check();

    expect(result.status).toBe('ok');
    expect(healthResponseSchema.safeParse(result).success).toBe(true);
  });
});
