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
