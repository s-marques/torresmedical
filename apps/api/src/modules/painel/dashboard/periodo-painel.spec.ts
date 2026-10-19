import { hojeNaClinica, periodoDoPainel } from './periodo-painel';

const BASE = { modo: 'mes', base: 'recebimento' } as const;

describe('periodoDoPainel', () => {
  it('mês escolhido: do dia 1 ao último dia, inclusive em fevereiro bissexto', () => {
    expect(periodoDoPainel({ ...BASE, mes: '2026-10' })).toEqual({
      de: '2026-10-01',
      ate: '2026-10-31',
    });
    expect(periodoDoPainel({ ...BASE, mes: '2028-02' }).ate).toBe('2028-02-29');
    expect(periodoDoPainel({ ...BASE, mes: '2026-02' }).ate).toBe('2026-02-28');
  });

  it('sem mês, usa o mês atual no fuso da clínica', () => {
    // 01/11 01:00 UTC ainda é 31/10 em São Paulo.
    const agora = new Date('2026-11-01T01:00:00Z');
    expect(hojeNaClinica(agora)).toBe('2026-10-31');
    expect(periodoDoPainel(BASE, agora)).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
  });

  it('por período: usa De e Até como vieram', () => {
    expect(
      periodoDoPainel({
        modo: 'periodo',
        base: 'competencia',
        de: '2026-09-15',
        ate: '2026-10-05',
      }),
    ).toEqual({ de: '2026-09-15', ate: '2026-10-05' });
  });
});
