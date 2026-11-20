import { describe, expect, it } from 'vitest';
import { indicadoresFinanceirosQuerySchema, variacaoPercentual } from './indicadores';

describe('indicadoresFinanceirosQuerySchema', () => {
  it('aceita mês AAAA-MM e vazio', () => {
    expect(indicadoresFinanceirosQuerySchema.parse({ mes: '2026-10' }).mes).toBe('2026-10');
    expect(indicadoresFinanceirosQuerySchema.parse({ mes: '' }).mes).toBeUndefined();
    expect(indicadoresFinanceirosQuerySchema.parse({}).mes).toBeUndefined();
  });

  it('rejeita mês inválido', () => {
    const r = indicadoresFinanceirosQuerySchema.safeParse({ mes: '2026-13' });
    expect(r.error?.issues[0]?.message).toBe('Mês inválido');
  });
});

describe('variacaoPercentual', () => {
  it('calcula (atual - anterior) / anterior com 1 casa', () => {
    expect(variacaoPercentual(110, 100)).toBe(10);
    expect(variacaoPercentual(9070, 13650)).toBe(-33.6);
  });

  it('é nula sem base de comparação', () => {
    expect(variacaoPercentual(10, 0)).toBeNull();
    expect(variacaoPercentual(null, 10)).toBeNull();
    expect(variacaoPercentual(10, null)).toBeNull();
  });
});
