import { describe, expect, it } from 'vitest';
import { listLancamentosConciliacaoQuerySchema, resumoConciliacaoQuerySchema } from './conciliacao';

describe('listLancamentosConciliacaoQuerySchema', () => {
  it('aplica os padrões: A Pagar, página 1', () => {
    expect(
      listLancamentosConciliacaoQuerySchema.parse({ de: '2026-09-30', ate: '2026-10-30' }),
    ).toMatchObject({ tipo: 'PAGAR', page: 1, de: '2026-09-30', ate: '2026-10-30' });
  });

  it('exige o período com a mensagem padrão', () => {
    const r = listLancamentosConciliacaoQuerySchema.safeParse({});
    expect(r.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
      ['de', 'Data inicial é obrigatória.'],
      ['ate', 'Data final é obrigatória.'],
    ]);
  });

  it('recusa período invertido, tipo e conta inválidos', () => {
    const invertido = listLancamentosConciliacaoQuerySchema.safeParse({
      de: '2026-10-30',
      ate: '2026-10-01',
    });
    expect(invertido.error?.issues).toEqual([
      expect.objectContaining({
        path: ['ate'],
        message: 'A data inicial deve ser anterior ou igual à data final',
      }),
    ]);
    const r = listLancamentosConciliacaoQuerySchema.safeParse({
      de: '2026-10-01',
      ate: '2026-10-30',
      tipo: 'X',
      contaBancariaId: 'x',
    });
    expect(r.error?.issues.map((i) => i.path.join('.'))).toEqual(['tipo', 'contaBancariaId']);
  });
});

describe('resumoConciliacaoQuerySchema', () => {
  it('aceita o período e recusa data inválida', () => {
    expect(resumoConciliacaoQuerySchema.parse({ de: '2026-10-01', ate: '2026-10-01' })).toEqual({
      de: '2026-10-01',
      ate: '2026-10-01',
    });
    expect(
      resumoConciliacaoQuerySchema.safeParse({ de: '2026-02-30', ate: '2026-10-01' }).error
        ?.issues[0]?.message,
    ).toBe('Data inicial inválida');
  });
});
