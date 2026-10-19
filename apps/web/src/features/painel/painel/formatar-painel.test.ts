import { describe, expect, it } from 'vitest';
import { formatarValor, formatoNumerico } from './formatar-painel';

describe('formatarValor', () => {
  it('sem valor mostra "—"', () => {
    expect(formatarValor(null, 'moeda')).toBe('—');
    expect(formatarValor(undefined, 'inteiro')).toBe('—');
    expect(formatarValor('', 'texto')).toBe('—');
  });

  it('formata moeda, percentual, inteiro, decimal e dias em pt-BR', () => {
    expect(formatarValor(2320, 'moeda')).toBe('R$ 2.320,00');
    expect(formatarValor(-5404.45, 'moeda')).toBe('-R$ 5.404,45');
    expect(formatarValor(28.8, 'percentual')).toBe('28,8%');
    expect(formatarValor(1284, 'inteiro')).toBe('1.284');
    expect(formatarValor(2.4, 'decimal')).toBe('2,4');
    expect(formatarValor(0, 'dias')).toBe('0 dias');
    expect(formatarValor(1, 'dias')).toBe('1 dia');
  });

  it('texto, hora e data', () => {
    expect(formatarValor('confirmado', 'texto')).toBe('confirmado');
    expect(formatarValor('07:00', 'hora')).toBe('07:00');
    expect(formatarValor('2026-10-15', 'data')).toBe('15/10/2026');
  });

  it('formatoNumerico: só os que viram série de gráfico', () => {
    expect(formatoNumerico('moeda')).toBe(true);
    expect(formatoNumerico('texto')).toBe(false);
    expect(formatoNumerico('data')).toBe(false);
  });
});
