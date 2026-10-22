import { describe, expect, it } from 'vitest';
import {
  adicionarDias,
  compararNomesSala,
  diaDaSemana,
  salaDashboardQuerySchema,
  salaOcupacaoQuerySchema,
  segundaDaSemana,
} from './sala-painel';

describe('datas da semana', () => {
  it('acha a segunda-feira da semana de qualquer dia', () => {
    expect(segundaDaSemana('2026-10-19')).toBe('2026-10-19');
    expect(segundaDaSemana('2026-10-22')).toBe('2026-10-19');
    expect(segundaDaSemana('2026-10-25')).toBe('2026-10-19');
    expect(segundaDaSemana('2026-10-26')).toBe('2026-10-26');
    expect(segundaDaSemana('2026-01-01')).toBe('2025-12-29');
  });

  it('soma dias atravessando mês e ano', () => {
    expect(adicionarDias('2026-10-19', 6)).toBe('2026-10-25');
    expect(adicionarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(adicionarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('informa o dia da semana com domingo = 0', () => {
    expect(diaDaSemana('2026-10-25')).toBe(0);
    expect(diaDaSemana('2026-10-22')).toBe(4);
  });
});

describe('compararNomesSala', () => {
  it('ordena numericamente', () => {
    const nomes = ['Sala 10', 'Sala 2', 'Sala 1', 'Sala 12', 'Sala 11'];
    expect([...nomes].sort(compararNomesSala)).toEqual([
      'Sala 1',
      'Sala 2',
      'Sala 10',
      'Sala 11',
      'Sala 12',
    ]);
  });
});

describe('queries', () => {
  it('aceitam a data opcional e rejeitam formato inválido', () => {
    expect(salaOcupacaoQuerySchema.parse({})).toEqual({});
    expect(salaOcupacaoQuerySchema.parse({ inicio: '2026-10-19' })).toEqual({
      inicio: '2026-10-19',
    });
    expect(salaDashboardQuerySchema.safeParse({ data: '22/10/2026' }).success).toBe(false);
    expect(salaOcupacaoQuerySchema.safeParse({ inicio: 'x' }).success).toBe(false);
  });
});
