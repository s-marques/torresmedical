import { describe, expect, it } from 'vitest';
import { createAgendamentoSchema, listAgendamentosQuerySchema } from './agendamento';

const ID = '00000000-0000-4000-8000-000000000001';

describe('createAgendamentoSchema', () => {
  const base = { pacienteId: ID, profissionalId: ID, data: '2026-10-22', hora: '16:00' };

  it('aplica os padrões do modal (30 min, sem convênio, sem valor)', () => {
    expect(createAgendamentoSchema.parse(base)).toEqual({
      ...base,
      duracaoMinutos: 30,
      tipoAgendamentoId: null,
      valor: null,
      convenio: false,
      observacoes: null,
    });
  });

  it('usa as mensagens do inventário para paciente e profissional vazios', () => {
    const r = createAgendamentoSchema.safeParse({ ...base, pacienteId: '', profissionalId: '' });
    const msgs = r.error?.issues.map((i) => i.message);
    expect(msgs).toContain('Selecione o paciente.');
    expect(msgs).toContain('Selecione o profissional.');
  });

  it('valida hora, duração e valor', () => {
    expect(createAgendamentoSchema.safeParse({ ...base, hora: '25:00' }).success).toBe(false);
    expect(createAgendamentoSchema.safeParse({ ...base, duracaoMinutos: 0 }).success).toBe(false);
    expect(createAgendamentoSchema.safeParse({ ...base, valor: -1 }).success).toBe(false);
    expect(createAgendamentoSchema.parse({ ...base, valor: '' }).valor).toBeNull();
    expect(createAgendamentoSchema.parse({ ...base, valor: 250 }).valor).toBe(250);
  });

  it('rejeita campos desconhecidos', () => {
    expect(createAgendamentoSchema.safeParse({ ...base, status: 'CONFIRMADO' }).success).toBe(
      false,
    );
  });
});

describe('listAgendamentosQuerySchema', () => {
  it('aceita uma semana', () => {
    expect(
      listAgendamentosQuerySchema.safeParse({ inicio: '2026-10-12', fim: '2026-10-18' }).success,
    ).toBe(true);
  });

  it('rejeita intervalo invertido ou maior que 31 dias', () => {
    expect(
      listAgendamentosQuerySchema.safeParse({ inicio: '2026-10-18', fim: '2026-10-12' }).success,
    ).toBe(false);
    expect(
      listAgendamentosQuerySchema.safeParse({ inicio: '2026-10-01', fim: '2026-11-15' }).success,
    ).toBe(false);
  });
});
