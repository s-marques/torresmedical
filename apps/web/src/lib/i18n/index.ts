import { IDIOMAS, type Idioma, type ModuloMenu, type TelaMenu } from '@torres/shared';
import i18next, { type TFunction } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { EN } from './locales/en';
import { ES } from './locales/es';
import { PT_BR } from './locales/pt-BR';

/**
 * Idiomas da interface (issue #30): português (padrão), inglês e espanhol, escolhidos na aba
 * Aparência da tela Configurações. Por enquanto só o layout (menu, cabeçalho, busca) e a
 * própria tela Configurações são traduzidos; as demais telas seguem em português.
 */
export const IDIOMA_PADRAO: Idioma = 'pt-BR';

/** Chave no localStorage. O idioma vale antes do login (vem da sessão depois dele). */
export const IDIOMA_STORAGE_KEY = 'torres-idioma';

/** Nome de cada idioma no próprio idioma (opções da aba Aparência). */
export const NOMES_IDIOMA: Record<Idioma, string> = {
  'pt-BR': 'Português',
  en: 'English',
  es: 'Español',
};

export function lerIdiomaSalvo(): Idioma {
  try {
    const salvo = localStorage.getItem(IDIOMA_STORAGE_KEY);
    return IDIOMAS.find((idioma) => idioma === salvo) ?? IDIOMA_PADRAO;
  } catch {
    return IDIOMA_PADRAO;
  }
}

function salvarIdioma(idioma: Idioma): void {
  try {
    localStorage.setItem(IDIOMA_STORAGE_KEY, idioma);
  } catch {
    // Sem storage (modo privado): vale só nesta aba.
  }
}

void i18next.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: PT_BR },
    en: { translation: EN },
    es: { translation: ES },
  },
  lng: lerIdiomaSalvo(),
  fallbackLng: IDIOMA_PADRAO,
  supportedLngs: [...IDIOMAS],
  interpolation: { escapeValue: false },
  // Recursos embutidos: inicializa de forma síncrona (sem piscar textos nem quebrar testes).
  initAsync: false,
});

document.documentElement.lang = i18next.language;

/** Troca o idioma da interface e o guarda no navegador. */
export function aplicarIdioma(idioma: Idioma): void {
  salvarIdioma(idioma);
  document.documentElement.lang = idioma;
  if (i18next.language !== idioma) void i18next.changeLanguage(idioma);
}

/** Nome do módulo no idioma atual (português vem do `MENU`). */
export function nomeModulo(t: TFunction, modulo: Pick<ModuloMenu, 'id' | 'nome'>): string {
  return t(`menu.modulos.${modulo.id}`, { defaultValue: modulo.nome });
}

/** Nome da tela no idioma atual (português vem do `MENU`). */
export function nomeTela(t: TFunction, tela: Pick<TelaMenu, 'id' | 'nome'>): string {
  return t(`menu.telas.${tela.id}`, { defaultValue: tela.nome });
}

export { i18next };
