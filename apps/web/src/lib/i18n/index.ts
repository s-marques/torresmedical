import {
  definirTradutorValidacao,
  IDIOMAS,
  type Idioma,
  type MensagemValidacao,
  type ModuloMenu,
  type TelaMenu,
  VALIDACAO_PT_BR,
} from '@torres/shared';
import i18next, { type TFunction } from 'i18next';
import { initReactI18next } from 'react-i18next';
import EN from './locales/en.json';
import ES from './locales/es.json';
import PT_BR from './locales/pt-BR.json';
import {
  ERROS_API_EN,
  ERROS_API_ES,
  ROTULOS_EN,
  ROTULOS_ES,
  VALIDACAO_EN,
  VALIDACAO_ES,
} from './locales/validacao';

/**
 * Idiomas da interface (issue #30): português (padrão), inglês e espanhol, escolhidos na aba
 * Aparência da tela Configurações. Traduzidos: layout, componentes compartilhados, login,
 * páginas de erro, validação e erros da API (#205) e a tela Configurações. As telas dos
 * módulos são traduzidas nas issues com a label `i18n`.
 *
 * Os textos ficam em `locales/*.json` (formato padrão do i18next). Os nomes das telas e
 * módulos em português vêm do `MENU` (`packages/shared`), por isso `pt-BR.json` não tem `menu`.
 * As mensagens de validação em português vêm de `VALIDACAO_PT_BR` (`packages/shared`), que
 * também vale no back. O teste `locales.test.ts` garante que os três idiomas têm as mesmas chaves.
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
    'pt-BR': {
      translation: { ...PT_BR, validacao: VALIDACAO_PT_BR },
      rotulos: {},
      errosApi: {},
    },
    en: {
      translation: { ...EN, validacao: VALIDACAO_EN },
      rotulos: ROTULOS_EN,
      errosApi: ERROS_API_EN,
    },
    es: {
      translation: { ...ES, validacao: VALIDACAO_ES },
      rotulos: ROTULOS_ES,
      errosApi: ERROS_API_ES,
    },
  },
  lng: lerIdiomaSalvo(),
  ns: ['translation', 'rotulos', 'errosApi'],
  defaultNS: 'translation',
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

/**
 * Rótulo de campo no idioma atual. A chave é o rótulo em português, como está no schema
 * (ex.: "Nome"); sem tradução, fica o português.
 */
export function traduzirRotulo(rotulo: string): string {
  return i18next.t(rotulo, {
    ns: 'rotulos',
    keySeparator: false,
    nsSeparator: false,
    defaultValue: rotulo,
  });
}

/** Mensagem de erro da API pelo `code`; sem tradução (e sempre em português), a do servidor. */
export function traduzirErroApi(code: string, mensagemServidor: string): string {
  return i18next.t(code, { ns: 'errosApi', defaultValue: mensagemServidor });
}

/** Mensagens de validação por chave (`packages/shared`), no idioma atual. */
export function traduzirMensagemValidacao({ chave, params = {} }: MensagemValidacao): string {
  const { campo, genero, ...resto } = params;
  return i18next.t(chave, {
    ...resto,
    ...(campo === undefined ? {} : { campo: traduzirRotulo(String(campo)) }),
    ...(genero === 'f' ? { context: 'f' } : {}),
  });
}

definirTradutorValidacao(traduzirMensagemValidacao);

/** Idioma atual da interface (para `Intl`: datas e números seguem o idioma; a moeda é sempre R$). */
export function idiomaAtual(): Idioma {
  return IDIOMAS.find((idioma) => idioma === i18next.language) ?? IDIOMA_PADRAO;
}

const formatadores = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();

/** `Intl.DateTimeFormat` do idioma atual, guardado por idioma e opções. */
export function formatoData(opcoes: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const chave = `d:${idiomaAtual()}:${JSON.stringify(opcoes)}`;
  let formato = formatadores.get(chave);
  if (!formato) {
    formato = new Intl.DateTimeFormat(idiomaAtual(), opcoes);
    formatadores.set(chave, formato);
  }
  return formato as Intl.DateTimeFormat;
}

/** `Intl.NumberFormat` do idioma atual, guardado por idioma e opções. */
export function formatoNumero(opcoes: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const chave = `n:${idiomaAtual()}:${JSON.stringify(opcoes)}`;
  let formato = formatadores.get(chave);
  if (!formato) {
    formato = new Intl.NumberFormat(idiomaAtual(), opcoes);
    formatadores.set(chave, formato);
  }
  return formato as Intl.NumberFormat;
}
