import { describe, expect, it } from 'vitest';
import { formatarData, formatarDataHora } from './formatar';

describe('formatar', () => {
  it('formata a data do calendário sem mudar o dia', () => {
    expect(formatarData('2026-10-31')).toBe('31/10/2026');
  });

  it('formata data/hora ISO no fuso local', () => {
    const iso = new Date(2026, 9, 31, 14, 3).toISOString();
    expect(formatarDataHora(iso)).toBe('31/10/2026, 14:03');
  });

  it('usa "-" para vazio ou inválido', () => {
    expect(formatarData(null)).toBe('-');
    expect(formatarDataHora('x')).toBe('-');
  });
});
