import type { ErrorDetail } from '@torres/shared';
import type { z } from 'zod';

/**
 * Converte os erros do Zod em `details` por campo (`field` com caminho em ponto, ex.: `itens.0.valor`).
 * Campos não permitidos geram um detalhe por campo.
 */
export function zodIssuesToDetails(issues: readonly z.core.$ZodIssue[]): ErrorDetail[] {
  return issues.flatMap((issue) => {
    const path = issue.path.map(String);
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        field: [...path, key].join('.'),
        message: 'Campo não permitido',
      }));
    }
    return [{ field: path.join('.'), message: issue.message }];
  });
}
