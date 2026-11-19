import { describe, expect, it } from 'vitest';
import {
  aplicarCor,
  aplicarDensidade,
  COR_STORAGE_KEY,
  DENSIDADE_STORAGE_KEY,
  lerCorSalva,
  lerDensidadeSalva,
  TEMA_PARA_THEME,
  THEME_PARA_TEMA,
} from './aparencia';

describe('aparência', () => {
  it('sem nada salvo, usa Esmeralda e Confortável', () => {
    expect(lerCorSalva()).toBe('esmeralda');
    expect(lerDensidadeSalva()).toBe('confortavel');
  });

  it('aplica no <html> e guarda a cópia no navegador', () => {
    aplicarCor('violeta');
    aplicarDensidade('espacoso');

    expect(document.documentElement.dataset.cor).toBe('violeta');
    expect(document.documentElement.dataset.densidade).toBe('espacoso');
    expect(lerCorSalva()).toBe('violeta');
    expect(lerDensidadeSalva()).toBe('espacoso');
  });

  it('ignora valores salvos fora do catálogo', () => {
    localStorage.setItem(COR_STORAGE_KEY, 'amarelo');
    localStorage.setItem(DENSIDADE_STORAGE_KEY, 'gigante');
    expect(lerCorSalva()).toBe('esmeralda');
    expect(lerDensidadeSalva()).toBe('confortavel');
  });

  it('converte o tema da tela para o do ThemeProvider e vice-versa', () => {
    for (const [tema, theme] of Object.entries(TEMA_PARA_THEME)) {
      expect(THEME_PARA_TEMA[theme]).toBe(tema);
    }
  });
});
