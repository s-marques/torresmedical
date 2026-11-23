import { describe, expect, it } from 'vitest';
import {
  agendaMatrizQuerySchema,
  deslocarMatriz,
  MATRIZ_STATUS,
  MATRIZ_STATUS_PRIORIDADE,
  periodoDaMatriz,
  turnoDoMinuto,
} from './agenda-matriz';

describe('agendaMatrizQuerySchema', () => {
  it('assume a visão semana e aceita a consulta vazia', () => {
    expect(agendaMatrizQuerySchema.parse({})).toEqual({ visao: 'semana' });
  });

  it('recusa visão, turno e situação desconhecidos', () => {
    expect(agendaMatrizQuerySchema.safeParse({ visao: 'ano' }).success).toBe(false);
    expect(agendaMatrizQuerySchema.safeParse({ turno: 'MADRUGADA' }).success).toBe(false);
    expect(agendaMatrizQuerySchema.safeParse({ situacao: 'X' }).success).toBe(false);
  });

  it('recusa campo desconhecido e ids que não são uuid', () => {
    expect(agendaMatrizQuerySchema.safeParse({ extra: 1 }).success).toBe(false);
    expect(agendaMatrizQuerySchema.safeParse({ salaId: '1' }).success).toBe(false);
  });
});

describe('periodoDaMatriz', () => {
  it('dia é o próprio dia', () => {
    expect(periodoDaMatriz('dia', '2026-10-22')).toEqual({
      inicio: '2026-10-22',
      fim: '2026-10-22',
    });
  });

  it('semana vai de segunda a domingo', () => {
    expect(periodoDaMatriz('semana', '2026-10-22')).toEqual({
      inicio: '2026-10-19',
      fim: '2026-10-25',
    });
  });

  it('mês vai do primeiro ao último dia, inclusive em fevereiro e ano bissexto', () => {
    expect(periodoDaMatriz('mes', '2026-10-22')).toEqual({
      inicio: '2026-10-01',
      fim: '2026-10-31',
    });
    expect(periodoDaMatriz('mes', '2026-02-10').fim).toBe('2026-02-28');
    expect(periodoDaMatriz('mes', '2028-02-10').fim).toBe('2028-02-29');
  });
});

describe('deslocarMatriz', () => {
  it('anda um dia, uma semana ou um mês', () => {
    expect(deslocarMatriz('dia', '2026-10-31', 1)).toBe('2026-11-01');
    expect(deslocarMatriz('semana', '2026-10-22', -1)).toBe('2026-10-15');
    expect(deslocarMatriz('mes', '2026-12-15', 1)).toBe('2027-01-01');
    expect(deslocarMatriz('mes', '2026-01-15', -1)).toBe('2025-12-01');
  });
});

describe('turnos e prioridade', () => {
  it('manhã até 12h, tarde das 12h às 18h e noite depois das 18h', () => {
    expect(turnoDoMinuto(0)).toBe('MANHA');
    expect(turnoDoMinuto(11 * 60 + 59)).toBe('MANHA');
    expect(turnoDoMinuto(12 * 60)).toBe('TARDE');
    expect(turnoDoMinuto(17 * 60 + 59)).toBe('TARDE');
    expect(turnoDoMinuto(18 * 60)).toBe('NOITE');
  });

  it('a prioridade cobre todos os status', () => {
    expect([...MATRIZ_STATUS_PRIORIDADE].sort()).toEqual([...MATRIZ_STATUS].sort());
  });
});
