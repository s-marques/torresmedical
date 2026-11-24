import { horariosDaTransicao, type HorariosAgendamento } from './recepcao-horarios';

const AGORA = new Date('2026-11-24T13:00:00.000Z');
const ANTES = new Date('2026-11-24T12:00:00.000Z');
const VAZIO: HorariosAgendamento = { chegadaEm: null, entradaEm: null, finalizadoEm: null };

describe('horariosDaTransicao', () => {
  it.each(['CHECK_IN', 'AGUARDANDO'] as const)('%s grava a chegada', (status) => {
    expect(horariosDaTransicao(VAZIO, status, AGORA)).toEqual({ chegadaEm: AGORA });
  });

  it('mantém a chegada original ao passar de Chegou para Aguardando', () => {
    expect(horariosDaTransicao({ ...VAZIO, chegadaEm: ANTES }, 'AGUARDANDO', AGORA)).toEqual({});
  });

  it('EM_ATENDIMENTO grava a entrada uma única vez', () => {
    expect(horariosDaTransicao(VAZIO, 'EM_ATENDIMENTO', AGORA)).toEqual({ entradaEm: AGORA });
    expect(horariosDaTransicao({ ...VAZIO, entradaEm: ANTES }, 'EM_ATENDIMENTO', AGORA)).toEqual(
      {},
    );
  });

  it('ATENDIDO grava a finalização uma única vez', () => {
    expect(horariosDaTransicao(VAZIO, 'ATENDIDO', AGORA)).toEqual({ finalizadoEm: AGORA });
    expect(horariosDaTransicao({ ...VAZIO, finalizadoEm: ANTES }, 'ATENDIDO', AGORA)).toEqual({});
  });

  it.each(['AGENDADO', 'CONFIRMADO', 'FALTOU', 'CANCELADO', 'REAGENDAR'] as const)(
    '%s apaga a chegada e não mexe nos demais horários',
    (status) => {
      expect(horariosDaTransicao({ ...VAZIO, chegadaEm: ANTES }, status, AGORA)).toEqual({
        chegadaEm: null,
      });
      expect(horariosDaTransicao(VAZIO, status, AGORA)).toEqual({});
    },
  );
});
