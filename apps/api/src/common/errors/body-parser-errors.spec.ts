import type { Request, Response } from 'express';
import { ApiException, ValidationException } from './api.exception';
import { mapBodyParserErrors } from './body-parser-errors';

function run(error: unknown): unknown {
  const next = jest.fn();
  mapBodyParserErrors(error, {} as Request, {} as Response, next);
  return next.mock.calls[0][0];
}

describe('mapBodyParserErrors', () => {
  it('JSON malformado vira 400 em português', () => {
    const mapped = run(
      Object.assign(new SyntaxError('Unexpected end'), { type: 'entity.parse.failed' }),
    );
    expect(mapped).toBeInstanceOf(ValidationException);
    expect((mapped as ValidationException).message).toBe('JSON inválido no corpo da requisição');
  });

  it('corpo grande demais vira 413', () => {
    const mapped = run({ type: 'entity.too.large' }) as ApiException;
    expect(mapped.getStatus()).toBe(413);
    expect(mapped.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('repassa outros erros sem alterar', () => {
    const error = new Error('x');
    expect(run(error)).toBe(error);
    expect(run(null)).toBeNull();
  });
});
