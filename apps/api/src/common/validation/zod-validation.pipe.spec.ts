import { createUnidadeSchema } from '@torres/shared';
import { z } from 'zod';
import { ValidationException } from '../errors/api.exception';
import { zodIssuesToDetails } from './zod-issues';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(createUnidadeSchema);

  it('retorna o valor convertido pelo schema', () => {
    expect(pipe.transform({ nome: '  Matriz ' })).toMatchObject({
      nome: 'Matriz',
      ativo: true,
    });
  });

  it('lança 400 com details por campo, em português', () => {
    const error = captureError(() => pipe.transform({ nome: '' }));

    expect(error).toBeInstanceOf(ValidationException);
    expect((error as ValidationException).details).toEqual([
      { field: 'nome', message: 'Informe o nome' },
    ]);
  });
});

describe('zodIssuesToDetails', () => {
  it('usa o caminho em ponto e separa campos não permitidos', () => {
    const schema = z.strictObject({ itens: z.array(z.object({ valor: z.number() })) });
    const result = schema.safeParse({ itens: [{ valor: 'x' }], extra: 1, outro: 2 });

    expect(zodIssuesToDetails(result.error?.issues ?? [])).toEqual([
      { field: 'itens.0.valor', message: 'Valor inválido' },
      { field: 'extra', message: 'Campo não permitido' },
      { field: 'outro', message: 'Campo não permitido' },
    ]);
  });
});

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('deveria ter lançado');
}
