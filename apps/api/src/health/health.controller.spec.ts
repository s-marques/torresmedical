import { healthResponseSchema } from '@torres/shared';
import type { MessagingConnection } from '../common/messaging/messaging.connection';
import { HealthController } from './health.controller';

function controller(connected: boolean) {
  return new HealthController({ isConnected: () => connected } as MessagingConnection);
}

describe('HealthController', () => {
  it('retorna status ok no formato do schema compartilhado', () => {
    const result = controller(true).check();

    expect(result.status).toBe('ok');
    expect(result.checks.mensageria).toBe('up');
    expect(healthResponseSchema.safeParse(result).success).toBe(true);
  });

  it('continua ok com a mensageria fora, indicando down', () => {
    const result = controller(false).check();

    expect(result.status).toBe('ok');
    expect(result.checks.mensageria).toBe('down');
  });
});
