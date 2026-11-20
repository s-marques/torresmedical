import type { BloqueioAgenda, HorarioAtendimento } from '@torres/shared';
import { avaliarDisponibilidade } from './disponibilidade-profissional';

/** 2026-11-20 é sexta-feira (diaSemana 5); 2026-11-24 é terça (2). */
const SEXTA = '2026-11-20';
const TERCA = '2026-11-24';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function semanal(extra: Partial<HorarioAtendimento> = {}): HorarioAtendimento {
  return {
    id: ID,
    tipo: 'SEMANAL',
    diaSemana: 5,
    data: null,
    inicio: '08:00',
    fim: '18:00',
    almocoInicio: null,
    almocoFim: null,
    ...extra,
  };
}

function bloqueio(extra: Partial<BloqueioAgenda> = {}): BloqueioAgenda {
  return {
    id: ID,
    dataInicio: SEXTA,
    dataFim: SEXTA,
    tipo: 'DIA_INTEIRO',
    horaInicio: null,
    horaFim: null,
    motivo: 'FERIAS',
    createdAt: '2026-11-01T12:00:00.000Z',
    ...extra,
  };
}

const min = (hhmm: string): number => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const avaliar = (
  horarios: HorarioAtendimento[],
  bloqueios: BloqueioAgenda[],
  data: string,
  inicio: string,
  fim: string,
) => avaliarDisponibilidade(horarios, bloqueios, data, min(inicio), min(fim));

describe('avaliarDisponibilidade', () => {
  it('sem nenhum horário cadastrado recusa (decisão do dev na #136)', () => {
    expect(avaliar([], [], SEXTA, '10:00', '10:30')).toEqual({ motivo: 'SEM_HORARIO_CADASTRADO' });
  });

  it('aceita o intervalo que cabe no horário semanal do dia, inclusive nas bordas', () => {
    expect(avaliar([semanal()], [], SEXTA, '08:00', '08:30')).toBeNull();
    expect(avaliar([semanal()], [], SEXTA, '17:30', '18:00')).toBeNull();
  });

  it('recusa o que começa antes, termina depois ou cai em dia sem horário', () => {
    expect(avaliar([semanal()], [], SEXTA, '07:45', '08:15')).toEqual({
      motivo: 'FORA_DO_HORARIO',
    });
    expect(avaliar([semanal()], [], SEXTA, '17:45', '18:15')).toEqual({
      motivo: 'FORA_DO_HORARIO',
    });
    expect(avaliar([semanal()], [], TERCA, '10:00', '10:30')).toEqual({
      motivo: 'FORA_DO_HORARIO',
    });
  });

  it('recusa o intervalo que passa da meia-noite', () => {
    expect(avaliar([semanal({ fim: '23:59' })], [], SEXTA, '23:30', '24:30')).toEqual({
      motivo: 'FORA_DO_HORARIO',
    });
  });

  describe('horário "Por Data"', () => {
    const porData = (extra: Partial<HorarioAtendimento> = {}) =>
      semanal({
        tipo: 'POR_DATA',
        diaSemana: null,
        data: TERCA,
        inicio: '10:00',
        fim: '12:00',
        ...extra,
      });
    const semanalTerca = semanal({ diaSemana: 2 });

    it('substitui o semanal do dia (exceção, não soma)', () => {
      const horarios = [semanalTerca, porData()];
      expect(avaliar(horarios, [], TERCA, '10:00', '10:30')).toBeNull();
      // 14:00 caberia no semanal (08–18), mas a linha Por Data vale sozinha naquele dia.
      expect(avaliar(horarios, [], TERCA, '14:00', '14:30')).toEqual({ motivo: 'FORA_DO_HORARIO' });
    });

    it('não afeta outras terças', () => {
      expect(avaliar([semanalTerca, porData()], [], '2026-12-01', '14:00', '14:30')).toBeNull();
    });
  });

  describe('almoço', () => {
    const horarios = [semanal({ almocoInicio: '12:00', almocoFim: '13:00' })];

    it('recusa quem invade o almoço, mesmo parcialmente', () => {
      expect(avaliar(horarios, [], SEXTA, '11:30', '12:30')).toEqual({ motivo: 'NO_ALMOCO' });
      expect(avaliar(horarios, [], SEXTA, '12:30', '13:30')).toEqual({ motivo: 'NO_ALMOCO' });
      expect(avaliar(horarios, [], SEXTA, '12:15', '12:45')).toEqual({ motivo: 'NO_ALMOCO' });
    });

    it('aceita o que termina quando o almoço começa ou começa quando ele termina', () => {
      expect(avaliar(horarios, [], SEXTA, '11:30', '12:00')).toBeNull();
      expect(avaliar(horarios, [], SEXTA, '13:00', '13:30')).toBeNull();
    });
  });

  describe('bloqueios do profissional', () => {
    it('bloqueio de dia inteiro recusa e informa o motivo', () => {
      expect(avaliar([semanal()], [bloqueio()], SEXTA, '10:00', '10:30')).toEqual({
        motivo: 'BLOQUEADO',
        descricao: 'Férias',
      });
    });

    it('bloqueio por horário só recusa o que o atinge', () => {
      const horario = bloqueio({
        tipo: 'HORARIO',
        horaInicio: '14:00',
        horaFim: '16:00',
        motivo: 'REUNIAO',
      });
      expect(avaliar([semanal()], [horario], SEXTA, '15:30', '16:30')).toEqual({
        motivo: 'BLOQUEADO',
        descricao: 'Reunião',
      });
      expect(avaliar([semanal()], [horario], SEXTA, '13:30', '14:00')).toBeNull();
      expect(avaliar([semanal()], [horario], SEXTA, '16:00', '16:30')).toBeNull();
    });

    it('o bloqueio vale antes do horário de atendimento na mensagem', () => {
      expect(avaliar([semanal()], [bloqueio()], SEXTA, '20:00', '20:30')).toMatchObject({
        motivo: 'BLOQUEADO',
      });
    });
  });
});
