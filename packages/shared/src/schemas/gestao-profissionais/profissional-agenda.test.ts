import { describe, expect, it } from 'vitest';
import { criarBloqueioSchema, minutosDoDia, salvarHorariosSchema } from './profissional-agenda';

function detalhes(resultado: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return resultado.error?.issues.map((i) => [i.path.join('.'), i.message]);
}

const SEMANAL = { tipo: 'SEMANAL', diaSemana: 4, inicio: '13:30', fim: '18:00' };

describe('salvarHorariosSchema', () => {
  it('aceita horários semanais e por data, com almoço opcional', () => {
    const dados = salvarHorariosSchema.parse({
      horarios: [
        { ...SEMANAL, almocoInicio: '', almocoFim: '' },
        { tipo: 'POR_DATA', data: '2026-12-24', inicio: '08:00', fim: '12:00' },
        { ...SEMANAL, diaSemana: 5, inicio: '08:00', almocoInicio: '12:00', almocoFim: '13:00' },
      ],
    });

    expect(dados.horarios[0]).toMatchObject({ almocoInicio: null, almocoFim: null });
    expect(dados.horarios[1]).toMatchObject({ diaSemana: null, data: '2026-12-24' });
  });

  it('valida dia/data, ordem das horas, almoço e formato', () => {
    const erros = (h: object) =>
      detalhes(salvarHorariosSchema.safeParse({ horarios: [{ ...SEMANAL, ...h }] }))?.map(
        (e) => e[1],
      );

    expect(erros({ diaSemana: null })).toEqual(['Selecione o dia']);
    expect(erros({ tipo: 'POR_DATA' })).toEqual(['Informe a data']);
    expect(erros({ inicio: '18:00', fim: '18:00' })).toEqual(['O fim deve ser depois do início']);
    expect(erros({ almocoInicio: '14:00' })).toEqual(['Informe o início e o fim do almoço']);
    expect(erros({ almocoInicio: '12:00', almocoFim: '13:00' })).toEqual([
      'O almoço deve ficar dentro do horário de atendimento',
    ]);
    expect(erros({ almocoInicio: '16:00', almocoFim: '15:00' })).toEqual([
      'O almoço deve ficar dentro do horário de atendimento',
    ]);
    expect(erros({ inicio: '24:00' })).toEqual(['Início inválido (HH:MM)']);
  });

  it('não repete o mesmo dia da semana nem a mesma data', () => {
    expect(detalhes(salvarHorariosSchema.safeParse({ horarios: [SEMANAL, SEMANAL] }))).toEqual([
      ['horarios.1.diaSemana', 'Dia já cadastrado'],
    ]);
    const porData = { tipo: 'POR_DATA', data: '2026-12-24', inicio: '08:00', fim: '12:00' };
    expect(detalhes(salvarHorariosSchema.safeParse({ horarios: [porData, porData] }))).toEqual([
      ['horarios.1.data', 'Data já cadastrada'],
    ]);
    expect(salvarHorariosSchema.safeParse({ horarios: [] }).success).toBe(true);
  });

  it('minutosDoDia', () => {
    expect(minutosDoDia('13:30')).toBe(810);
  });
});

describe('criarBloqueioSchema', () => {
  it('Data Única, dia inteiro: a data fim é a própria data e as horas são descartadas', () => {
    expect(
      criarBloqueioSchema.parse({
        dataInicio: '2026-11-10',
        motivo: 'FOLGA',
        horaInicio: '08:00',
      }),
    ).toMatchObject({
      dataFim: '2026-11-10',
      tipo: 'DIA_INTEIRO',
      horaInicio: null,
      horaFim: null,
    });
  });

  it('Lote: período de dias inteiros', () => {
    expect(
      criarBloqueioSchema.parse({
        dataInicio: '2026-11-10',
        dataFim: '2026-11-14',
        motivo: 'FERIAS',
      }),
    ).toMatchObject({ dataInicio: '2026-11-10', dataFim: '2026-11-14', tipo: 'DIA_INTEIRO' });
  });

  it('Horário específico: exige as horas, em ordem, e vale para uma data só', () => {
    const base = { dataInicio: '2026-11-10', tipo: 'HORARIO', motivo: 'REUNIAO' };
    expect(
      criarBloqueioSchema.parse({ ...base, horaInicio: '08:00', horaFim: '10:00' }),
    ).toMatchObject({ dataFim: '2026-11-10', horaInicio: '08:00', horaFim: '10:00' });
    expect(detalhes(criarBloqueioSchema.safeParse(base))).toEqual([
      ['horaInicio', 'Informe a hora inicial'],
      ['horaFim', 'Informe a hora final'],
    ]);
    expect(
      detalhes(criarBloqueioSchema.safeParse({ ...base, horaInicio: '10:00', horaFim: '09:00' })),
    ).toEqual([['horaFim', 'A hora final deve ser depois da inicial']]);
    expect(
      detalhes(
        criarBloqueioSchema.safeParse({
          ...base,
          dataFim: '2026-11-12',
          horaInicio: '08:00',
          horaFim: '09:00',
        }),
      ),
    ).toEqual([['tipo', 'Horário específico vale para uma data só']]);
  });

  it('valida data fim, motivo e data obrigatória', () => {
    expect(
      detalhes(
        criarBloqueioSchema.safeParse({
          dataInicio: '2026-11-10',
          dataFim: '2026-11-09',
          motivo: 'FOLGA',
        }),
      ),
    ).toEqual([['dataFim', 'A data fim deve ser igual ou posterior à data início']]);
    expect(detalhes(criarBloqueioSchema.safeParse({ dataInicio: '2026-11-10' }))).toEqual([
      ['motivo', 'Selecione o motivo'],
    ]);
    expect(detalhes(criarBloqueioSchema.safeParse({ motivo: 'FOLGA' }))).toEqual([
      ['dataInicio', 'Data é obrigatória'],
    ]);
  });
});
