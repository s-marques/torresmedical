import baseEn from './base.en.json';
import baseEs from './base.es.json';
import basePtBr from './base.pt-BR.json';

/**
 * Textos da base (issue #205): componentes compartilhados, login, páginas de erro e mensagens
 * do cliente HTTP. Ficam em JSON (um arquivo por idioma) e entram em `PT_BR`, `EN` e `ES` por spread.
 */
export const BASE_PT_BR = basePtBr;

/** Formato dos textos da base: inglês e espanhol seguem as mesmas chaves do português. */
export type TextosBase = typeof BASE_PT_BR;

export const BASE_EN: TextosBase = baseEn;
export const BASE_ES: TextosBase = baseEs;
