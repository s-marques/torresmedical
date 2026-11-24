import { describe, expect, it } from 'vitest';
import { formatarEspera, minutosDeEspera } from './espera';

const CHEGADA = '2026-11-24T12:00:00.000Z';
const AGORA = Date.parse('2026-11-24T12:25:30.000Z');

describe('minutosDeEspera', () => {
  it('quem está na clínica espera até agora, em minutos cheios', () => {
    for (const status of ['CHECK_IN', 'AGUARDANDO'] as const) {
      expect(minutosDeEspera({ status, chegadaEm: CHEGADA, entradaEm: null }, AGORA)).toBe(25);
    }
  });

  it('quem já entrou espera da chegada até a entrada, e o tempo para de correr', () => {
    const item = {
      status: 'EM_ATENDIMENTO' as const,
      chegadaEm: CHEGADA,
      entradaEm: '2026-11-24T12:10:00.000Z',
    };
    expect(minutosDeEspera(item, AGORA)).toBe(10);
    expect(minutosDeEspera(item, AGORA + 3_600_000)).toBe(10);
  });

  it('sem chegada, ou sem entrada fora da clínica, não há espera', () => {
    expect(
      minutosDeEspera({ status: 'CONFIRMADO', chegadaEm: null, entradaEm: null }, AGORA),
    ).toBeNull();
    expect(
      minutosDeEspera({ status: 'ATENDIDO', chegadaEm: CHEGADA, entradaEm: null }, AGORA),
    ).toBeNull();
  });

  it('relógio atrasado não gera espera negativa', () => {
    expect(
      minutosDeEspera(
        { status: 'CHECK_IN', chegadaEm: CHEGADA, entradaEm: null },
        AGORA - 3_600_000,
      ),
    ).toBe(0);
  });
});

describe('formatarEspera', () => {
  it('formata minutos e horas', () => {
    expect(formatarEspera(0)).toBe('0 min');
    expect(formatarEspera(59)).toBe('59 min');
    expect(formatarEspera(60)).toBe('1 h 00 min');
    expect(formatarEspera(75)).toBe('1 h 15 min');
  });
});
