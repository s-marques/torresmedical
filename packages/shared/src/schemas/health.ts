import { z } from 'zod';

/** Estado de uma dependência da API. */
export const healthCheckStatusSchema = z.enum(['up', 'down']);

/**
 * `status` é da API (responde 200 mesmo com dependência fora). `checks` mostra cada
 * dependência: com a mensageria fora, os eventos esperam na outbox até ela voltar.
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
  checks: z.object({ mensageria: healthCheckStatusSchema }),
});

export type HealthCheckStatus = z.infer<typeof healthCheckStatusSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
