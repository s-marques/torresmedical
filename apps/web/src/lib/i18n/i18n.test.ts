import { describe, expect, it } from 'vitest';
import {
  aplicarIdioma,
  i18next,
  IDIOMA_STORAGE_KEY,
  lerIdiomaSalvo,
  nomeModulo,
  nomeTela,
} from '.';

describe('i18n', () => {
  it('lê o idioma salvo e ignora valores fora do catálogo', () => {
    expect(lerIdiomaSalvo()).toBe('pt-BR');
    localStorage.setItem(IDIOMA_STORAGE_KEY, 'es');
    expect(lerIdiomaSalvo()).toBe('es');
    localStorage.setItem(IDIOMA_STORAGE_KEY, 'de');
    expect(lerIdiomaSalvo()).toBe('pt-BR');
  });

  it('troca o idioma, guarda no navegador e marca o <html lang>', () => {
    aplicarIdioma('en');
    expect(i18next.language).toBe('en');
    expect(localStorage.getItem(IDIOMA_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('nomes do menu: português vem do MENU; inglês e espanhol, das traduções', () => {
    const tela = { id: 'financeiro.contas-receber' as const, nome: 'Contas a Receber' };
    const modulo = { id: 'financeiro' as const, nome: 'FINANCEIRO' };

    expect(nomeTela(i18next.t, tela)).toBe('Contas a Receber');
    expect(nomeModulo(i18next.t, modulo)).toBe('FINANCEIRO');

    aplicarIdioma('en');
    expect(nomeTela(i18next.t, tela)).toBe('Accounts Receivable');
    expect(nomeModulo(i18next.t, modulo)).toBe('FINANCE');

    aplicarIdioma('es');
    expect(nomeTela(i18next.t, tela)).toBe('Cuentas por Cobrar');
  });
});
