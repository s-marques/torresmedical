import { describe, expect, it } from 'vitest';
import { auditLogPageSchema, auditLogQuerySchema } from './audit-log';

describe('auditLogQuerySchema', () => {
  it('aceita filtros válidos e converte o período para Date', () => {
    const query = auditLogQuerySchema.parse({
      entity: ' Empresa ',
      action: 'UPDATE',
      de: '2026-10-01T00:00:00-03:00',
      ate: '2026-10-14T23:59:59.999Z',
    });

    expect(query).toMatchObject({ page: 1, pageSize: 10, entity: 'Empresa', action: 'UPDATE' });
    expect(query.de).toEqual(new Date('2026-10-01T03:00:00.000Z'));
    expect(query.ate).toBeInstanceOf(Date);
  });

  it('rejeita ação fora do enum', () => {
    const result = auditLogQuerySchema.safeParse({ action: 'APAGAR' });
    expect(result.error?.issues[0]).toMatchObject({ path: ['action'], message: 'Ação inválida' });
  });

  it('rejeita data sem fuso ou inválida', () => {
    for (const de of ['2026-10-01', '2026-10-01T00:00:00', 'ontem']) {
      const result = auditLogQuerySchema.safeParse({ de });
      expect(result.error?.issues[0]).toMatchObject({
        path: ['de'],
        message: 'Data/hora inválida',
      });
    }
  });

  it('rejeita período invertido', () => {
    const result = auditLogQuerySchema.safeParse({
      de: '2026-10-14T00:00:00Z',
      ate: '2026-10-01T00:00:00Z',
    });
    expect(result.error?.issues[0]).toMatchObject({
      path: ['ate'],
      message: 'A data inicial deve ser anterior ou igual à final',
    });
  });
});

describe('auditLogPageSchema', () => {
  it('valida a resposta da listagem', () => {
    const page = {
      data: [
        {
          id: '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f',
          userId: 'system',
          occurredAt: '2026-10-14T12:00:00.000Z',
          action: 'CREATE',
          entity: 'Empresa',
          entityId: '1',
          before: null,
          after: { nome: 'X' },
          requestId: null,
          ip: null,
        },
      ],
      meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    };
    expect(auditLogPageSchema.safeParse(page).success).toBe(true);
  });
});
