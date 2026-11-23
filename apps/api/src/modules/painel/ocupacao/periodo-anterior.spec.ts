import { diasDoPeriodo, periodoAnterior } from './periodo-anterior';

describe('periodoAnterior', () => {
  it('por mês: o mês anterior inteiro', () => {
    expect(periodoAnterior('2026-10-01', '2026-10-31', 'mes')).toEqual({
      de: '2026-09-01',
      ate: '2026-09-30',
    });
    expect(periodoAnterior('2026-01-01', '2026-01-31', 'mes')).toEqual({
      de: '2025-12-01',
      ate: '2025-12-31',
    });
  });

  it('por período: janela de mesmo tamanho logo antes', () => {
    expect(periodoAnterior('2026-10-10', '2026-10-16', 'periodo')).toEqual({
      de: '2026-10-03',
      ate: '2026-10-09',
    });
  });
});

describe('diasDoPeriodo', () => {
  it('lista os dias, inclusive os extremos', () => {
    expect(diasDoPeriodo('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });
});
