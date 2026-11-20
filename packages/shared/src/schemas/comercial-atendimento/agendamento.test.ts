import { describe, expect, it } from 'vitest';
import {
  createAgendamentoSchema,
  listAgendamentosQuerySchema,
  salaSugeridaQuerySchema,
  updateAgendamentoSchema,
} from './agendamento';

const ID = '00000000-0000-4000-8000-000000000001';

describe('createAgendamentoSchema', () => {
  const base = {
    pacienteId: ID,
    profissionalId: ID,
    salaId: ID,
    data: '2026-10-22',
    hora: '16:00',
  };

  it('a sala é obrigatória (issue #136)', () => {
    const semSala: Record<string, unknown> = { ...base };
    delete semSala.salaId;
    for (const entrada of [semSala, { ...base, salaId: '' }, { ...base, salaId: null }]) {
      const r = createAgendamentoSchema.safeParse(entrada);
      expect(r.success).toBe(false);
      expect(r.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
        ['salaId', 'Sala é obrigatória.'],
      ]);
    }
  });

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

describe('updateAgendamentoSchema', () => {
  it('aceita qualquer combinação de sala, data, hora e duração', () => {
    expect(updateAgendamentoSchema.parse({ salaId: ID })).toEqual({ salaId: ID });
    expect(
      updateAgendamentoSchema.parse({
        salaId: ID,
        data: '2026-10-22',
        hora: '10:30',
        duracaoMinutos: 45,
      }),
    ).toEqual({ salaId: ID, data: '2026-10-22', hora: '10:30', duracaoMinutos: 45 });
  });

  it('exige ao menos um campo', () => {
    const r = updateAgendamentoSchema.safeParse({});
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Informe ao menos um campo para alterar');
  });

  it('valida cada campo e rejeita o que a edição não altera', () => {
    expect(updateAgendamentoSchema.safeParse({ hora: '25:00' }).success).toBe(false);
    expect(updateAgendamentoSchema.safeParse({ duracaoMinutos: 0 }).success).toBe(false);
    expect(updateAgendamentoSchema.safeParse({ data: '22/10/2026' }).success).toBe(false);
    expect(updateAgendamentoSchema.safeParse({ salaId: '' }).success).toBe(false);
    expect(updateAgendamentoSchema.safeParse({ status: 'CANCELADO' }).success).toBe(false);
    expect(updateAgendamentoSchema.safeParse({ pacienteId: ID, hora: '10:00' }).success).toBe(
      false,
    );
  });
});

describe('salaSugeridaQuerySchema', () => {
  it('aceita profissional, data e hora', () => {
    expect(
      salaSugeridaQuerySchema.safeParse({ profissionalId: ID, data: '2026-11-20', hora: '14:00' })
        .success,
    ).toBe(true);
  });

  it('exige os três e valida o formato', () => {
    expect(salaSugeridaQuerySchema.safeParse({}).success).toBe(false);
    expect(
      salaSugeridaQuerySchema.safeParse({ profissionalId: 'x', data: '2026-11-20', hora: '14:00' })
        .success,
    ).toBe(false);
    expect(
      salaSugeridaQuerySchema.safeParse({ profissionalId: ID, data: '2026-11-20', hora: '24:00' })
        .success,
    ).toBe(false);
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
