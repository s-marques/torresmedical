import { beforeEach, describe, expect, it } from 'vitest';
import { aplicarIdioma } from '@/lib/i18n';
import {
  formatarValorIndicador,
  formatarVariacao,
  mesCurto,
  mesPadrao,
  mesPorExtenso,
  mesValido,
} from './formatar-apresentacao';

describe('formatar-apresentacao', () => {
  beforeEach(() => aplicarIdioma('pt-BR'));

  it('formata o valor pelo formato do indicador', () => {
    expect(formatarValorIndicador('moeda', 1234.5)).toMatch(/R\$\s?1\.234,50/);
    expect(formatarValorIndicador('percentual', 42.55)).toBe('42,6%');
    expect(formatarValorIndicador('nps', -10)).toBe('-10');
    expect(formatarValorIndicador('numero', 12.345)).toBe('12,345');
  });

  it('variação: percentual em moeda e número, pontos em percentual e NPS', () => {
    expect(formatarVariacao('moeda', 12.5, 'p.p.')).toBe('+12,5%');
    expect(formatarVariacao('numero', -33.3, 'p.p.')).toBe('-33,3%');
    expect(formatarVariacao('nps', -60, 'p.p.')).toBe('-60 p.p.');
    expect(formatarVariacao('percentual', 0, 'p.p.')).toBe('0 p.p.');
  });

  it('mês por extenso e curto seguem o idioma e não mudam com o fuso', () => {
    expect(mesPorExtenso('2026-10')).toBe('outubro de 2026');
    expect(mesCurto('2026-01')).toBe('jan. de 26');
    aplicarIdioma('en');
    expect(mesPorExtenso('2026-10')).toBe('October 2026');
    aplicarIdioma('es');
    expect(mesPorExtenso('2026-10')).toBe('octubre de 2026');
  });

  it('valida o mês AAAA-MM', () => {
    expect(mesValido('2026-10')).toBe(true);
    for (const invalido of ['2026-13', '2026-1', '26-10', '', null, undefined]) {
      expect(mesValido(invalido)).toBe(false);
    }
  });

  it('o mês padrão é o anterior ao de hoje, inclusive na virada do ano', () => {
    expect(mesPadrao(new Date(2026, 10, 27))).toBe('2026-10');
    expect(mesPadrao(new Date(2027, 0, 5))).toBe('2026-12');
  });
});
