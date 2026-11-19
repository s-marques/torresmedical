import {
  DENSIDADES,
  ESQUEMAS_COR,
  PREFERENCIAS_PADRAO,
  type Densidade,
  type EsquemaCor,
  type Tema,
} from '@torres/shared';
import type { Theme } from './theme';

/**
 * Esquema de cores e densidade da aba Aparência (issue #30), aplicados como `data-cor` e
 * `data-densidade` no `<html>` (estilos em `index.css`). A fonte é a sessão do usuário (banco);
 * o localStorage é só cópia, para o script do `index.html` aplicar antes da primeira pintura.
 */
export const COR_STORAGE_KEY = 'torres-cor';
export const DENSIDADE_STORAGE_KEY = 'torres-densidade';

/** Tema da tela Configurações (`claro`/`escuro`/`sistema`) ↔ tema do ThemeProvider. */
export const TEMA_PARA_THEME: Record<Tema, Theme> = {
  claro: 'light',
  escuro: 'dark',
  sistema: 'system',
};

export const THEME_PARA_TEMA: Record<Theme, Tema> = {
  light: 'claro',
  dark: 'escuro',
  system: 'sistema',
};

function ler<T extends string>(chave: string, validos: readonly T[], padrao: T): T {
  try {
    const salvo = localStorage.getItem(chave);
    return validos.find((valor) => valor === salvo) ?? padrao;
  } catch {
    return padrao;
  }
}

function guardar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Sem storage (modo privado): vale só nesta aba.
  }
}

export function lerCorSalva(): EsquemaCor {
  return ler(COR_STORAGE_KEY, ESQUEMAS_COR, PREFERENCIAS_PADRAO.esquemaCor);
}

export function lerDensidadeSalva(): Densidade {
  return ler(DENSIDADE_STORAGE_KEY, DENSIDADES, PREFERENCIAS_PADRAO.densidade);
}

export function aplicarCor(cor: EsquemaCor): void {
  guardar(COR_STORAGE_KEY, cor);
  document.documentElement.dataset.cor = cor;
}

export function aplicarDensidade(densidade: Densidade): void {
  guardar(DENSIDADE_STORAGE_KEY, densidade);
  document.documentElement.dataset.densidade = densidade;
}
