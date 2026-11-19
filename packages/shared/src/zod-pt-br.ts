import { z } from 'zod';
import { traduzirValidacao, type ParametrosValidacao } from './i18n/validacao';

type Issue = Parameters<NonNullable<z.core.$ZodConfig['customError']>>[0];

const FORMATOS = new Set(['email', 'uuid', 'guid', 'url', 'datetime', 'date', 'time']);

function isMissing(input: unknown): boolean {
  return input === undefined || input === null;
}

function t(chave: string, params?: ParametrosValidacao): string {
  return traduzirValidacao(`validacao.${chave}`, params);
}

function chaveComparacao(min: boolean, inclusive: boolean): string {
  if (min) return inclusive ? 'maiorOuIgual' : 'maior';
  return inclusive ? 'menorOuIgual' : 'menor';
}

function sizeMessage(issue: Issue & { code: 'too_small' | 'too_big' }): string {
  const min = issue.code === 'too_small';
  const limit = min ? issue.minimum : issue.maximum;
  switch (issue.origin) {
    case 'string':
      return t(min ? 'textoMin' : 'textoMax', { count: Number(limit) });
    case 'array':
    case 'set':
      return t(min ? 'itensMin' : 'itensMax', { count: Number(limit) });
    default:
      return t(chaveComparacao(min, issue.inclusive ?? true), { valor: String(limit) });
  }
}

/**
 * Mensagens padrão de validação (CLAUDE.md, seção 3), por chave: em português no back e no
 * idioma do usuário no front (issue #205). Mensagens definidas no próprio schema têm precedência.
 */
export function zodErrorPtBr(issue: Issue): string | undefined {
  switch (issue.code) {
    case 'invalid_type':
      return isMissing(issue.input) ? t('campoObrigatorio') : t('valorInvalido');
    case 'too_small':
    case 'too_big':
      return sizeMessage(issue);
    case 'invalid_format':
      return FORMATOS.has(issue.format) ? t(`formato.${issue.format}`) : t('formatoInvalido');
    case 'invalid_value':
      return isMissing(issue.input) ? t('campoObrigatorio') : t('opcaoInvalida');
    case 'not_multiple_of':
      return t('multiploDe', { valor: String(issue.divisor) });
    case 'unrecognized_keys':
      return t('camposNaoPermitidos', { campos: issue.keys.join(', ') });
    default:
      return t('valorInvalido');
  }
}

z.config({ customError: zodErrorPtBr });
