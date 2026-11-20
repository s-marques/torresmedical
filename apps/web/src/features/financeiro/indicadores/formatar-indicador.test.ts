import { describe, expect, it } from 'vitest';
import { formatarIndicador, formatarPercentual } from './formatar-indicador';

describe('formatarIndicador', () => {
  it('formata moeda, percentual e inteiro', () => {
    expect(formatarIndicador(9070, 'moeda')).toMatch(/R\$\s*9\.070,00/);
    expect(formatarIndicador(28.8, 'percentual')).toBe('28,8%');
    expect(formatarIndicador(68, 'inteiro')).toBe('68');
  });

  it('sem valor (sem fonte de dados) vira "—"', () => {
    expect(formatarIndicador(null, 'moeda')).toBe('—');
  });

  it('formatarPercentual usa uma casa decimal', () => {
    expect(formatarPercentual(33.64)).toBe('33,6%');
  });
});
