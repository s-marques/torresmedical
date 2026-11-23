import { cicloDevido, somarMeses } from './ciclo-pesquisa-profissional';

describe('somarMeses', () => {
  it('soma meses mantendo o dia', () => {
    expect(somarMeses('2026-01-15', 6)).toBe('2026-07-15');
    expect(somarMeses('2026-10-20', 3)).toBe('2027-01-20');
  });

  it('dia 31 num mês mais curto cai no último dia do mês', () => {
    expect(somarMeses('2026-08-31', 1)).toBe('2026-09-30');
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29');
  });
});

describe('cicloDevido', () => {
  const INICIO = '2026-10-18'; // 30 dias depois: 2026-11-17

  it('antes dos 30 dias do início do contrato não há pesquisa', () => {
    expect(cicloDevido(INICIO, '2026-11-16', 6)).toBeNull();
    expect(cicloDevido(INICIO, '2026-10-18', 6)).toBeNull();
  });

  it('no dia em que completa 30 dias já vale a pesquisa dos 30 dias (ciclo 0)', () => {
    expect(cicloDevido(INICIO, '2026-11-17', 6)).toBe(0);
    expect(cicloDevido(INICIO, '2027-05-16', 6)).toBe(0);
  });

  it('depois da periodicidade configurada passa para o ciclo seguinte', () => {
    // 2026-11-17 + 6 meses = 2027-05-17
    expect(cicloDevido(INICIO, '2027-05-17', 6)).toBe(1);
    expect(cicloDevido(INICIO, '2027-11-17', 6)).toBe(2);
  });

  it('respeita a periodicidade trimestral', () => {
    expect(cicloDevido(INICIO, '2027-02-16', 3)).toBe(0);
    expect(cicloDevido(INICIO, '2027-02-17', 3)).toBe(1);
    expect(cicloDevido(INICIO, '2027-05-17', 3)).toBe(2);
  });

  it('contrato antigo (recurso novo): vale só o ciclo mais recente, sem as atrasadas', () => {
    // Primeira em 2024-01-31; a cada 6 meses: jul/24, jan/25, jul/25, jan/26 e jul/26 já passaram.
    expect(cicloDevido('2024-01-01', '2026-11-17', 6)).toBe(5);
  });
});
