import { z } from 'zod';
import { paginatedResponseSchema, paginationQuerySchema } from '../common/pagination';

export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'EXPORT'] as const;

export const auditActionSchema = z.enum(AUDIT_ACTIONS, { error: 'Ação inválida' });

export type AuditAction = z.infer<typeof auditActionSchema>;

const optionalText = z.string().trim().min(1).max(200).optional();
// Instante com fuso (ex.: 2026-10-14T00:00:00-03:00): o front converte a data local.
const instant = z.iso
  .datetime({ offset: true, error: 'Data/hora inválida' })
  .transform((value) => new Date(value))
  .optional();

/** Filtros de `GET /api/auditoria`. */
export const auditLogQuerySchema = paginationQuerySchema
  .extend({
    entity: optionalText,
    entityId: optionalText,
    userId: optionalText,
    action: auditActionSchema.optional(),
    de: instant,
    ate: instant,
  })
  .refine((query) => !query.de || !query.ate || query.de <= query.ate, {
    error: 'A data inicial deve ser anterior ou igual à final',
    path: ['ate'],
  });

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const auditLogSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  occurredAt: z.iso.datetime(),
  action: auditActionSchema,
  entity: z.string(),
  entityId: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  requestId: z.string().nullable(),
  ip: z.string().nullable(),
});

export type AuditLogItem = z.infer<typeof auditLogSchema>;

export const auditLogPageSchema = paginatedResponseSchema(auditLogSchema);

export type AuditLogPage = z.infer<typeof auditLogPageSchema>;
