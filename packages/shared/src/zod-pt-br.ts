import { z } from 'zod';

type Issue = Parameters<NonNullable<z.core.$ZodConfig['customError']>>[0];

const FORMAT_MESSAGES: Readonly<Record<string, string>> = {
  email: 'E-mail inválido',
  uuid: 'Identificador inválido',
  guid: 'Identificador inválido',
  url: 'URL inválida',
  datetime: 'Data/hora inválida',
  date: 'Data inválida',
  time: 'Hora inválida',
};

const COMPARISON: Readonly<Record<string, string>> = {
  'min:true': 'maior ou igual a',
  'min:false': 'maior que',
  'max:true': 'menor ou igual a',
  'max:false': 'menor que',
};

function isMissing(input: unknown): boolean {
  return input === undefined || input === null;
}

function plural(count: number | bigint, singular: string, pluralForm: string): string {
  return `${count} ${Number(count) === 1 ? singular : pluralForm}`;
}

function sizeMessage(issue: Issue & { code: 'too_small' | 'too_big' }): string {
  const min = issue.code === 'too_small';
  const limit = min ? issue.minimum : issue.maximum;
  const inclusive = issue.inclusive ?? true;
  switch (issue.origin) {
    case 'string':
      return `Deve ter no ${min ? 'mínimo' : 'máximo'} ${plural(limit, 'caractere', 'caracteres')}`;
    case 'array':
    case 'set':
      return `Deve ter no ${min ? 'mínimo' : 'máximo'} ${plural(limit, 'item', 'itens')}`;
    default:
      return `Deve ser ${COMPARISON[`${min ? 'min' : 'max'}:${inclusive}`]} ${String(limit)}`;
  }
}

/**
 * Mensagens padrão de validação em português do Brasil (CLAUDE.md, seção 3).
 * Mensagens definidas no próprio schema têm precedência.
 */
export function zodErrorPtBr(issue: Issue): string | undefined {
  switch (issue.code) {
    case 'invalid_type':
      return isMissing(issue.input) ? 'Campo obrigatório' : 'Valor inválido';
    case 'too_small':
    case 'too_big':
      return sizeMessage(issue);
    case 'invalid_format':
      return FORMAT_MESSAGES[issue.format] ?? 'Formato inválido';
    case 'invalid_value':
      return isMissing(issue.input) ? 'Campo obrigatório' : 'Opção inválida';
    case 'not_multiple_of':
      return `Deve ser múltiplo de ${String(issue.divisor)}`;
    case 'unrecognized_keys':
      return `Campo não permitido: ${issue.keys.join(', ')}`;
    default:
      return 'Valor inválido';
  }
}

z.config({ customError: zodErrorPtBr });
