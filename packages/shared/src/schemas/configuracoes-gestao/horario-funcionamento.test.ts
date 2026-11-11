import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  diaHorarioSchema,
  horariosFuncionamentoResponseSchema,
  salvarHorariosFuncionamentoSchema,
  HORARIO_INTERVALOS_MAX,
} from './horario-funcionamento';

function fieldMessages(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.') || '_', i.message]),
  );
}

/** Os 7 dias, todos fechados, menos o indicado (que recebe os campos passados). */
function semana(diaSemana: number, overrides: Record<string, unknown> = {}) {
  return {
    dias: Array.from({ length: 7 }, (_, dia) =>
      dia === diaSemana
        ? { diaSemana, fechado: false, intervalos: [], ...overrides }
        : { diaSemana: dia, fechado: true },
    ),
  };
}

describe('salvarHorariosFuncionamentoSchema', () => {
  it('dia fechado não exige abre/fecha nem pausas', () => {
    const entrada = {
      dias: Array.from({ length: 7 }, (_, dia) => ({
        diaSemana: dia,
        fechado: true,
        abre: null,
        fecha: null,
      })),
    };
    const resultado = salvarHorariosFuncionamentoSchema.parse(entrada);
    expect(resultado.dias.every((d) => d.fechado && d.abre === null && d.fecha === null)).toBe(
      true,
    );
  });

  it('dia aberto exige abre e fecha', () => {
    const resultado = fieldMessages(
      salvarHorariosFuncionamentoSchema.safeParse(semana(1, { abre: undefined, fecha: undefined })),
    );
    expect(resultado).toEqual({
      'dias.1.abre': 'Informe o horário de abertura',
      'dias.1.fecha': 'Informe o horário de fechamento',
    });
  });

  it('fecha deve ser depois de abre', () => {
    const resultado = fieldMessages(
      salvarHorariosFuncionamentoSchema.safeParse(semana(1, { abre: '18:00', fecha: '08:00' })),
    );
    expect(resultado).toEqual({
      'dias.1.fecha': 'O fechamento deve ser depois da abertura',
    });
  });

  it('aceita um dia aberto com pausa dentro do expediente', () => {
    const entrada = semana(1, {
      abre: '08:00',
      fecha: '18:00',
      intervalos: [{ inicio: '12:00', fim: '13:00' }],
    });
    const resultado = salvarHorariosFuncionamentoSchema.parse(entrada);
    const segunda = resultado.dias.find((d) => d.diaSemana === 1);
    expect(segunda).toMatchObject({
      fechado: false,
      abre: '08:00',
      fecha: '18:00',
      intervalos: [{ inicio: '12:00', fim: '13:00' }],
    });
  });

  it('pausa fora do expediente (antes de abrir ou depois de fechar) é rejeitada', () => {
    const antesDeAbrir = fieldMessages(
      salvarHorariosFuncionamentoSchema.safeParse(
        semana(1, {
          abre: '08:00',
          fecha: '18:00',
          intervalos: [{ inicio: '07:00', fim: '07:30' }],
        }),
      ),
    );
    expect(antesDeAbrir).toEqual({
      'dias.1.intervalos.0.inicio': 'A pausa deve ficar dentro do horário de funcionamento',
    });

    const depoisDeFechar = fieldMessages(
      salvarHorariosFuncionamentoSchema.safeParse(
        semana(1, {
          abre: '08:00',
          fecha: '18:00',
          intervalos: [{ inicio: '19:00', fim: '19:30' }],
        }),
      ),
    );
    expect(depoisDeFechar).toEqual({
      'dias.1.intervalos.0.inicio': 'A pausa deve ficar dentro do horário de funcionamento',
    });
  });

  it('pausa com fim antes do início é rejeitada', () => {
    const resultado = fieldMessages(
      salvarHorariosFuncionamentoSchema.safeParse(
        semana(1, {
          abre: '08:00',
          fecha: '18:00',
          intervalos: [{ inicio: '13:00', fim: '12:00' }],
        }),
      ),
    );
    expect(resultado).toEqual({
      'dias.1.intervalos.0.fim': 'O fim da pausa deve ser depois do início',
    });
  });

  it('respeita o máximo de pausas por dia', () => {
    const intervalos = Array.from({ length: HORARIO_INTERVALOS_MAX + 1 }, (_, i) => ({
      inicio: `0${8 + i}:00`.slice(-5),
      fim: `0${8 + i}:30`.slice(-5),
    }));
    const resultado = salvarHorariosFuncionamentoSchema.safeParse(
      semana(1, { abre: '08:00', fecha: '20:00', intervalos }),
    );
    expect(resultado.success).toBe(false);
  });

  it('exige exatamente os 7 dias, um de cada', () => {
    const faltando = Array.from({ length: 6 }, (_, dia) => ({ diaSemana: dia, fechado: true }));
    expect(salvarHorariosFuncionamentoSchema.safeParse({ dias: faltando }).success).toBe(false);

    const repetido = Array.from({ length: 7 }, (_, i) => ({
      diaSemana: i === 6 ? 0 : i,
      fechado: true,
    }));
    const resultado = salvarHorariosFuncionamentoSchema.safeParse({ dias: repetido });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe('Cada dia da semana deve aparecer uma vez');
  });

  it('rejeita hora em formato inválido e campo não permitido', () => {
    const horaInvalida = fieldMessages(
      salvarHorariosFuncionamentoSchema.safeParse(semana(1, { abre: '25:00', fecha: '18:00' })),
    );
    expect(horaInvalida).toHaveProperty('dias.1.abre');

    const campoExtra = semana(1, { abre: '08:00', fecha: '18:00' });
    (campoExtra.dias[1] as Record<string, unknown>).extra = 1;
    expect(salvarHorariosFuncionamentoSchema.safeParse(campoExtra).success).toBe(false);
  });
});

describe('diaHorarioSchema / horariosFuncionamentoResponseSchema', () => {
  it('representam a resposta da API', () => {
    const dia = {
      diaSemana: 1,
      fechado: false,
      abre: '08:00',
      fecha: '18:00',
      intervalos: [{ id: '00000000-0000-4000-8000-000000000001', inicio: '12:00', fim: '13:00' }],
    };
    expect(diaHorarioSchema.parse(dia)).toEqual(dia);
    expect(horariosFuncionamentoResponseSchema.parse({ data: [dia] })).toEqual({ data: [dia] });
  });
});
