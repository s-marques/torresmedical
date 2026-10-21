import { z } from 'zod';

export type GeneroCampo = 'm' | 'f';

/**
 * Mensagem padrão de campo obrigatório vazio: "<Campo> é obrigatório." (feminino: "obrigatória.").
 * Mensagens de formato inválido seguem outro padrão ("Informe …", "… inválido").
 */
export function mensagemObrigatoria(rotulo: string, genero: GeneroCampo = 'm'): string {
  return `${rotulo} é obrigatóri${genero === 'f' ? 'a' : 'o'}.`;
}

export interface TextoObrigatorioOptions {
  genero?: GeneroCampo;
  /** Tamanho máximo, com a mensagem "O <campo> deve ter no máximo N caracteres". */
  max?: number;
}

/** Texto obrigatório: sem espaços nas pontas e com a mensagem padrão quando vazio ou ausente. */
export function textoObrigatorio(rotulo: string, { genero, max }: TextoObrigatorioOptions = {}) {
  const mensagem = mensagemObrigatoria(rotulo, genero);
  const base = z.string({ error: mensagem }).trim().min(1, { error: mensagem });
  return max === undefined
    ? base
    : base.max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` });
}
