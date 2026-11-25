import { describe, expect, it } from 'vitest';
import {
  AUDIT_GRUPOS,
  AUDIT_GRUPOS_DEFINICAO,
  auditLogPageSchema,
  auditLogQuerySchema,
  diffAuditoria,
  exportAuditLogQuerySchema,
} from './audit-log';

describe('auditLogQuerySchema', () => {
  it('aceita filtros válidos e converte o período para Date', () => {
    const query = auditLogQuerySchema.parse({
      entity: ' Empresa ',
      action: 'UPDATE',
      de: '2026-10-01T00:00:00-03:00',
      ate: '2026-10-14T23:59:59.999Z',
    });

    expect(query).toMatchObject({
      page: 1,
      pageSize: 10,
      entity: 'Empresa',
      action: 'UPDATE',
      sort: { field: 'occurredAt', direction: 'desc' },
    });
    expect(query.de).toEqual(new Date('2026-10-01T03:00:00.000Z'));
    expect(query.ate).toBeInstanceOf(Date);
  });

  it('dia inteiro (AAAA-MM-DD) vale do início ao fim do dia no fuso da clínica', () => {
    const query = auditLogQuerySchema.parse({ de: '2026-10-01', ate: '2026-10-01' });

    expect(query.de).toEqual(new Date('2026-10-01T03:00:00.000Z'));
    expect(query.ate).toEqual(new Date('2026-10-02T02:59:59.999Z'));
  });

  it('aceita atalho, busca e ordenação; rejeita o que está fora da lista', () => {
    expect(
      auditLogQuerySchema.parse({ grupo: 'contrato', search: ' abc ', sort: 'entity:asc' }),
    ).toMatchObject({ grupo: 'contrato', search: 'abc', sort: { field: 'entity' } });
    expect(auditLogQuerySchema.safeParse({ grupo: 'tudo' }).error?.issues[0]).toMatchObject({
      path: ['grupo'],
      message: 'Atalho inválido',
    });
    expect(auditLogQuerySchema.safeParse({ sort: 'userId:asc' }).success).toBe(false);
  });

  it('rejeita ação fora do enum', () => {
    const result = auditLogQuerySchema.safeParse({ action: 'APAGAR' });
    expect(result.error?.issues[0]).toMatchObject({ path: ['action'], message: 'Ação inválida' });
  });

  it('rejeita data sem fuso ou inválida', () => {
    for (const de of ['2026-10-01T00:00:00', 'ontem', '2026-13-40']) {
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

describe('exportAuditLogQuerySchema', () => {
  it('traz os filtros, o formato e as colunas (todas por padrão), sem paginação', () => {
    const query = exportAuditLogQuerySchema.parse({ format: 'xlsx', grupo: 'exclusoes' });

    expect(query).toMatchObject({ format: 'xlsx', grupo: 'exclusoes' });
    expect(query.columns).toEqual(['data', 'usuario', 'acao', 'entidade', 'registro', 'campos']);
    expect(query).not.toHaveProperty('page');
  });

  it('rejeita coluna desconhecida e período invertido', () => {
    expect(exportAuditLogQuerySchema.safeParse({ format: 'pdf', columns: 'antes' }).success).toBe(
      false,
    );
    expect(
      exportAuditLogQuerySchema.safeParse({ format: 'pdf', de: '2026-10-05', ate: '2026-10-01' })
        .success,
    ).toBe(false);
  });
});

describe('atalhos de eventos', () => {
  it('todo atalho tem definição com ação, entidades ou status final', () => {
    for (const grupo of AUDIT_GRUPOS) {
      const { action, entities, statusFinal } = AUDIT_GRUPOS_DEFINICAO[grupo];
      expect(action ?? entities ?? statusFinal).toBeDefined();
    }
  });
});

describe('diffAuditoria', () => {
  it('lista só os campos que mudaram, sem updatedAt', () => {
    const diff = diffAuditoria(
      { valorUnitario: '100', status: 'ATIVO', permuta: false, updatedAt: 'a' },
      { valorUnitario: '150', status: 'ATIVO', permuta: true, updatedAt: 'b' },
    );

    expect(diff).toEqual([
      { campo: 'valorUnitario', antes: '100', depois: '150' },
      { campo: 'permuta', antes: false, depois: true },
    ]);
  });

  it('compara valores aninhados pelo conteúdo', () => {
    expect(diffAuditoria({ dias: [1, 2] }, { dias: [1, 2] })).toEqual([]);
    expect(diffAuditoria({ dias: [1] }, { dias: [1, 2] })).toEqual([
      { campo: 'dias', antes: [1], depois: [1, 2] },
    ]);
  });

  it('em CREATE e DELETE lista todos os campos', () => {
    expect(diffAuditoria(null, { nome: 'X' })).toEqual([
      { campo: 'nome', antes: null, depois: 'X' },
    ]);
    expect(diffAuditoria({ nome: 'X' }, null)).toEqual([
      { campo: 'nome', antes: 'X', depois: null },
    ]);
    expect(diffAuditoria(null, null)).toEqual([]);
  });
});

describe('auditLogPageSchema', () => {
  const item = {
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
  };
  const meta = { page: 1, pageSize: 10, total: 1, totalPages: 1 };

  it('valida a resposta da listagem e preenche os campos novos', () => {
    const resultado = auditLogPageSchema.parse({ data: [item], meta });

    expect(resultado.data[0]).toMatchObject({ userNome: null, campos: [], restrito: false });
  });
});
