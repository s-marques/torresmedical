import { z } from 'zod';
import { traduzirValidacao } from '../../i18n/validacao';

export type GeneroCampo = 'm' | 'f';

/**
 * Mensagem padrão de campo obrigatório vazio: "<Campo> é obrigatório." (feminino: "obrigatória."),
 * no idioma do tradutor registrado (issue #205). Calcula o texto na hora da chamada: dentro de
 * um schema, use `erroObrigatorio` para a mensagem acompanhar o idioma do usuário.
 * Mensagens de formato inválido seguem outro padrão ("Informe …", "… inválido").
 */
export function mensagemObrigatoria(rotulo: string, genero: GeneroCampo = 'm'): string {
  return traduzirValidacao('validacao.obrigatorio', { campo: rotulo, genero });
}

/**
 * A mesma mensagem de `mensagemObrigatoria`, calculada só quando o Zod reporta o erro.
 * Ex.: `z.string({ error: erroObrigatorio('Nome') }).min(1, { error: erroObrigatorio('Nome') })`.
 */
export function erroObrigatorio(rotulo: string, genero: GeneroCampo = 'm'): () => string {
  return () => mensagemObrigatoria(rotulo, genero);
}

export interface TextoObrigatorioOptions {
  genero?: GeneroCampo;
  /** Tamanho máximo, com a mensagem "<Campo> deve ter no máximo N caracteres". */
  max?: number;
}

/** Texto obrigatório: sem espaços nas pontas e com a mensagem padrão quando vazio ou ausente. */
export function textoObrigatorio(rotulo: string, { genero, max }: TextoObrigatorioOptions = {}) {
  const mensagem = erroObrigatorio(rotulo, genero);
  const base = z.string({ error: mensagem }).trim().min(1, { error: mensagem });
  return max === undefined
    ? base
    : base.max(max, {
        error: () => traduzirValidacao('validacao.campoMax', { campo: rotulo, count: max }),
      });
}
