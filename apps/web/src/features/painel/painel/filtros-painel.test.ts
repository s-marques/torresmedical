import { describe, expect, it } from 'vitest';
import {
  filtrosDaUrl,
  filtrosParaApi,
  filtrosParaUrl,
  mesesDisponiveis,
  QUANTIDADE_MESES,
  rotuloDoMes,
} from './filtros-painel';

const HOJE = new Date(2026, 9, 19);

describe('meses', () => {
  it('rotula como no sistema atual', () => {
    expect(rotuloDoMes('2026-10')).toBe('Outubro de 2026');
    expect(rotuloDoMes('2025-03')).toBe('Março de 2025');
  });

  it('oferece os últimos 24 meses, do atual para trás, virando o ano', () => {
    const meses = mesesDisponiveis(HOJE);
    expect(meses).toHaveLength(QUANTIDADE_MESES);
    expect(meses[0]).toBe('2026-10');
    expect(meses[10]).toBe('2025-12');
    expect(meses.at(-1)).toBe('2024-11');
  });
});

describe('filtros na URL', () => {
  it('sem parâmetros: aba executivo, por mês, mês atual, recebimento', () => {
    expect(filtrosDaUrl(new URLSearchParams(), HOJE)).toEqual({
      aba: 'executivo',
      modo: 'mes',
      mes: '2026-10',
      de: '',
      ate: '',
      base: 'recebimento',
    });
  });

  it('valores inválidos voltam ao padrão', () => {
    const filtros = filtrosDaUrl(new URLSearchParams('aba=x&modo=y&mes=2026-99&base=z'), HOJE);
    expect(filtros).toMatchObject({
      aba: 'executivo',
      modo: 'mes',
      mes: '2026-10',
      base: 'recebimento',
    });
  });

  it('ida e volta, com só os campos do modo', () => {
    const mes = {
      aba: 'financeiro',
      modo: 'mes',
      mes: '2026-08',
      de: 'x',
      ate: 'y',
      base: 'competencia',
    } as const;
    expect(filtrosParaUrl(mes).toString()).toBe(
      'aba=financeiro&modo=mes&base=competencia&mes=2026-08',
    );
    expect(filtrosParaApi(mes)).toEqual({ modo: 'mes', mes: '2026-08', base: 'competencia' });

    const periodo = { ...mes, modo: 'periodo', de: '2026-09-01', ate: '2026-09-30' } as const;
    expect(filtrosDaUrl(filtrosParaUrl(periodo), HOJE)).toMatchObject({
      modo: 'periodo',
      de: '2026-09-01',
      ate: '2026-09-30',
    });
    expect(filtrosParaApi(periodo)).toEqual({
      modo: 'periodo',
      de: '2026-09-01',
      ate: '2026-09-30',
      base: 'competencia',
    });
  });
});

describe('filtros da aba Ocupação (#139)', () => {
  const SALA = '11111111-1111-4111-8111-111111111111';
  const PROF = '22222222-2222-4222-8222-222222222222';
  const base = {
    aba: 'ocupacao',
    modo: 'mes',
    mes: '2026-10',
    de: '',
    ate: '',
    base: 'recebimento',
  } as const;

  it('ida e volta pela URL', () => {
    const filtros = {
      ...base,
      salaId: SALA,
      profissionalId: PROF,
      turno: 'TARDE',
      diaSemana: '4',
    } as const;

    const url = filtrosParaUrl(filtros);

    expect(url.get('salaId')).toBe(SALA);
    expect(filtrosDaUrl(url, HOJE)).toMatchObject({
      salaId: SALA,
      profissionalId: PROF,
      turno: 'TARDE',
      diaSemana: '4',
    });
  });

  it('sem filtro, nada vai para a URL nem para a API', () => {
    expect(filtrosParaUrl(base).toString()).toBe(
      'aba=ocupacao&modo=mes&base=recebimento&mes=2026-10',
    );
    expect(filtrosParaApi(base)).toEqual({ modo: 'mes', mes: '2026-10', base: 'recebimento' });
  });

  it('só a aba Ocupação manda os filtros para a API', () => {
    const filtros = { ...base, salaId: SALA, turno: 'NOITE', diaSemana: '0' } as const;

    expect(filtrosParaApi(filtros)).toEqual({
      modo: 'mes',
      mes: '2026-10',
      base: 'recebimento',
      salaId: SALA,
      turno: 'NOITE',
      diaSemana: '0',
    });
    expect(filtrosParaApi({ ...filtros, aba: 'comercial' })).toEqual({
      modo: 'mes',
      mes: '2026-10',
      base: 'recebimento',
    });
  });

  it('valores inválidos na URL são ignorados', () => {
    const filtros = filtrosDaUrl(
      new URLSearchParams('aba=ocupacao&salaId=x&profissionalId=y&turno=MADRUGADA&diaSemana=9'),
      HOJE,
    );

    expect(filtros.salaId).toBeUndefined();
    expect(filtros.profissionalId).toBeUndefined();
    expect(filtros.turno).toBeUndefined();
    expect(filtros.diaSemana).toBeUndefined();
  });
});
