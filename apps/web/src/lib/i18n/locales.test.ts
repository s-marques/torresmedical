import { MENU, VALIDACAO_PT_BR } from '@torres/shared';
import { describe, expect, it } from 'vitest';
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

/** Chaves das folhas (`layout.sair`, `configuracoes.abas.perfil`…), ordenadas. */
function chaves(objeto: object, prefixo = ''): string[] {
  return Object.entries(objeto)
    .flatMap(([chave, valor]) =>
      typeof valor === 'object' && valor !== null
        ? chaves(valor as object, `${prefixo}${chave}.`)
        : [`${prefixo}${chave}`],
    )
    .sort((a, b) => a.localeCompare(b));
}

function semMenu(objeto: Record<string, unknown>): object {
  return Object.fromEntries(Object.entries(objeto).filter(([chave]) => chave !== 'menu'));
}

const IDS_MODULOS = MENU.map((modulo) => `menu.modulos.${modulo.id}`).sort((a, b) =>
  a.localeCompare(b),
);
const IDS_TELAS = MENU.flatMap((modulo) => modulo.telas.map((tela) => `menu.telas.${tela.id}`));

describe('textos dos idiomas (locales/*.json)', () => {
  it.each([
    ['en', EN],
    ['es', ES],
  ])('%s tem as mesmas chaves do português', (_idioma, textos) => {
    expect(chaves(semMenu(textos))).toEqual(chaves(PT_BR));
  });

  it.each([
    ['en', EN],
    ['es', ES],
  ])('%s traduz todos os módulos e telas do menu', (_idioma, textos) => {
    const doMenu = chaves(textos.menu, 'menu.');
    expect(doMenu.filter((chave) => chave.startsWith('menu.modulos.'))).toEqual(IDS_MODULOS);
    expect(doMenu.filter((chave) => chave.startsWith('menu.telas.'))).toEqual(
      [...IDS_TELAS].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('nenhum texto vazio', () => {
    for (const textos of [PT_BR, EN, ES]) {
      const vazios = chaves(textos).filter((chave) => {
        const valor = chave
          .split('.')
          .reduce<unknown>((atual, parte) => (atual as Record<string, unknown>)[parte], textos);
        return typeof valor !== 'string' || valor.trim() === '';
      });
      expect(vazios).toEqual([]);
    }
  });

  it.each([
    ['en', VALIDACAO_EN],
    ['es', VALIDACAO_ES],
  ])('validação em %s tem as mesmas chaves do português (issue #205)', (_idioma, textos) => {
    expect(chaves(textos)).toEqual(chaves(VALIDACAO_PT_BR));
  });

  it('erros da API e rótulos têm as mesmas chaves em inglês e espanhol', () => {
    expect(chaves(ERROS_API_ES)).toEqual(chaves(ERROS_API_EN));
    expect(chaves(ROTULOS_ES)).toEqual(chaves(ROTULOS_EN));
  });
});
