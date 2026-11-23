import type { ContratoSala } from '@torres/shared';
import {
  calcularOcupacao,
  percentual,
  type BloqueioDaOcupacao,
  type EntradaOcupacao,
} from './calculo-ocupacao';

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const E = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
/** Quinta e sexta. */
const QUINTA = '2026-10-22';
const SEXTA = '2026-10-23';

function contrato(
  salaId: string,
  profissionalId: string,
  diaSemana: number,
  inicio: string,
  fim: string,
): ContratoSala {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    salaId,
    locatarioTipo: 'PROFISSIONAL',
    locatarioId: profissionalId,
    dataInicio: '2026-09-01',
    dataFim: null,
    dias: [{ diaSemana, inicio, fim }],
  } as unknown as ContratoSala;
}

const minutos = (h: number, m = 0) => h * 60 + m;

/**
 * Cenário conhecido: 2 salas × 2 dias (quinta e sexta) × 3 turnos = 12 períodos.
 * - S1 quinta manhã: contratada por A, e A atendeu → utilizado;
 * - S1 quinta tarde: contratada por B, agendada mas sem atendimento → contratado sem uso;
 * - S2 sexta manhã: contratada por C, que faltou → contratado sem uso;
 * - S2 quinta noite: atendimento avulso de D (sem contrato) → utilizado;
 * - S2 quinta tarde: manutenção → fora da capacidade (11 períodos);
 * - S1 sexta noite: reserva → ocupado.
 */
function cenario(extra: Partial<EntradaOcupacao> = {}): EntradaOcupacao {
  const bloqueios: BloqueioDaOcupacao[] = [
    {
      salaId: S2,
      tipo: 'MANUTENCAO',
      profissionalId: null,
      data: QUINTA,
      inicio: '12:00',
      fim: '18:00',
    },
    { salaId: S1, tipo: 'RESERVA', profissionalId: E, data: SEXTA, inicio: '18:00', fim: '20:00' },
  ];
  return {
    salas: [
      { id: S1, nome: 'Sala 1' },
      { id: S2, nome: 'Sala 2' },
    ],
    dias: [QUINTA, SEXTA],
    turnos: ['MANHA', 'TARDE', 'NOITE'],
    contratos: [
      contrato(S1, A, 4, '08:00', '12:00'),
      contrato(S1, B, 4, '13:00', '17:00'),
      contrato(S2, C, 5, '08:00', '12:00'),
    ],
    bloqueios,
    agendamentos: [
      {
        salaId: S1,
        profissionalId: A,
        data: QUINTA,
        inicioMinuto: minutos(9),
        fimMinuto: minutos(10),
        status: 'ATENDIDO',
      },
      {
        salaId: S1,
        profissionalId: B,
        data: QUINTA,
        inicioMinuto: minutos(14),
        fimMinuto: minutos(15),
        status: 'AGENDADO',
      },
      {
        salaId: S2,
        profissionalId: D,
        data: QUINTA,
        inicioMinuto: minutos(19),
        fimMinuto: minutos(20),
        status: 'EM_ATENDIMENTO',
      },
      {
        salaId: S2,
        profissionalId: C,
        data: SEXTA,
        inicioMinuto: minutos(9),
        fimMinuto: minutos(10),
        status: 'FALTOU',
      },
    ],
    profissionalIds: [A, B, C, D, E],
    ...extra,
  };
}

describe('calcularOcupacao', () => {
  it('cenário conhecido: capacidade, contratado, utilizado, sem uso, ocupado e vago', () => {
    const { total } = calcularOcupacao(cenario());

    expect(total).toEqual({
      capacidade: 11,
      contratados: 3,
      utilizados: 2,
      contratadosSemUso: 2,
      ocupados: 5,
      vagos: 6,
    });
    expect(percentual(total.utilizados, total.capacidade)).toBe(18.2);
    expect(percentual(total.contratados, total.capacidade)).toBe(27.3);
  });

  it('por sala e por turno somam o total', () => {
    const r = calcularOcupacao(cenario());

    expect(r.porSala.map((s) => [s.sala, s.capacidade, s.contratados, s.utilizados])).toEqual([
      ['Sala 1', 6, 2, 1],
      ['Sala 2', 5, 1, 1],
    ]);
    expect(r.porTurno.map((t) => [t.turno, t.capacidade, t.contratados, t.utilizados])).toEqual([
      ['MANHA', 4, 2, 1],
      ['TARDE', 3, 1, 0],
      ['NOITE', 4, 0, 1],
    ]);
    expect(r.porDia).toEqual([
      { data: QUINTA, ocupadosPorTurno: { MANHA: 1, TARDE: 1, NOITE: 1 }, vagos: 2 },
      { data: SEXTA, ocupadosPorTurno: { MANHA: 1, TARDE: 0, NOITE: 1 }, vagos: 4 },
    ]);
  });

  it('profissional com contrato e sem atendimento aparece com 0% de uso; todos aparecem', () => {
    const { porProfissional } = calcularOcupacao(cenario());
    const por = (id: string) => porProfissional.find((p) => p.profissionalId === id);

    expect(por(A)).toMatchObject({ contratados: 1, utilizados: 1, taxaUso: 100 });
    expect(por(B)).toMatchObject({ contratados: 1, utilizados: 0, taxaUso: 0 });
    expect(por(C)).toMatchObject({ contratados: 1, utilizados: 0, taxaUso: 0 });
    // Atendeu sem contrato: sem base para o % de uso do contratado.
    expect(por(D)).toMatchObject({ contratados: 0, utilizados: 1, taxaUso: null });
    // Sem contrato nem atendimento: aparece zerado.
    expect(por(E)).toMatchObject({ contratados: 0, utilizados: 0, taxaUso: null });
    expect(porProfissional).toHaveLength(5);
  });

  it('filtro de profissional: contratado e utilizado dele; o vago continua o da sala inteira', () => {
    const { total } = calcularOcupacao(cenario({ profissionalId: B }));

    expect(total).toEqual({
      capacidade: 11,
      contratados: 1,
      utilizados: 0,
      contratadosSemUso: 1,
      ocupados: 5,
      vagos: 6,
    });
  });

  it('filtro de turno e de sala restringem os períodos contados', () => {
    const manha = calcularOcupacao(cenario({ turnos: ['MANHA'] })).total;
    expect(manha).toMatchObject({
      capacidade: 4,
      contratados: 2,
      utilizados: 1,
      contratadosSemUso: 1,
    });

    const sala2 = calcularOcupacao(cenario({ salas: [{ id: S2, nome: 'Sala 2' }] })).total;
    expect(sala2).toMatchObject({ capacidade: 5, contratados: 1, utilizados: 1 });
  });

  it('filtro de dia: só os dias informados entram', () => {
    const { total } = calcularOcupacao(cenario({ dias: [SEXTA] }));

    expect(total).toMatchObject({
      capacidade: 6,
      contratados: 1,
      utilizados: 0,
      contratadosSemUso: 1,
    });
  });

  it('bloqueio e manutenção saem da capacidade; reserva conta como ocupado', () => {
    const { total } = calcularOcupacao(
      cenario({
        contratos: [],
        agendamentos: [],
        bloqueios: [
          {
            salaId: S1,
            tipo: 'BLOQUEIO',
            profissionalId: null,
            data: QUINTA,
            inicio: '00:00',
            fim: '24:00',
          },
          {
            salaId: S2,
            tipo: 'CORTESIA',
            profissionalId: A,
            data: QUINTA,
            inicio: '08:00',
            fim: '09:00',
          },
        ],
      }),
    );

    // S1 quinta (3 períodos) fora; sobram 9; a cortesia ocupa 1.
    expect(total).toMatchObject({
      capacidade: 9,
      contratados: 0,
      utilizados: 0,
      ocupados: 1,
      vagos: 8,
    });
  });

  it('cancelado nunca chega (fora da consulta); faltou e agendado não são utilizados', () => {
    const { total } = calcularOcupacao(cenario({ contratos: [], bloqueios: [] }));

    // Só os atendimentos de A (ATENDIDO) e D (EM_ATENDIMENTO) contam.
    expect(total.utilizados).toBe(2);
  });

  it('horários de maior demanda por hora do dia, do maior para o menor', () => {
    const { demandaPorHora } = calcularOcupacao(cenario());

    expect(demandaPorHora).toEqual([
      { hora: 9, agendamentos: 2, utilizados: 1 },
      { hora: 14, agendamentos: 1, utilizados: 0 },
      { hora: 19, agendamentos: 1, utilizados: 1 },
    ]);
  });

  it('horários ociosos: dia da semana × turno, do mais vago para o menos', () => {
    const { ociosos } = calcularOcupacao(cenario());

    expect(ociosos[0]).toEqual({ diaSemana: 5, turno: 'TARDE', vagos: 2, capacidade: 2 });
    expect(ociosos.find((o) => o.diaSemana === 4 && o.turno === 'TARDE')).toMatchObject({
      vagos: 0,
      capacidade: 1,
    });
  });

  it('sem salas ou sem dias: tudo zerado, sem dividir por zero', () => {
    const r = calcularOcupacao(cenario({ salas: [], dias: [] }));

    expect(r.total.capacidade).toBe(0);
    expect(percentual(r.total.utilizados, r.total.capacidade)).toBeNull();
  });

  it('contrato fora da vigência não conta', () => {
    const vencido = { ...contrato(S1, A, 4, '08:00', '12:00'), dataFim: '2026-10-01' };
    const { total } = calcularOcupacao(
      cenario({ contratos: [vencido], agendamentos: [], bloqueios: [] }),
    );

    expect(total.contratados).toBe(0);
  });
});
