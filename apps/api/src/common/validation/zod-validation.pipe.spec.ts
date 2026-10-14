import { createUnidadeSchema } from '@torres/shared';
import { z } from 'zod';
import { ValidationException } from '../errors/api.exception';
import { zodIssuesToDetails } from './zod-issues';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(createUnidadeSchema);

  it('retorna o valor convertido pelo schema', () => {
    const empresaId = '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';
    expect(pipe.transform({ empresaId, nome: '  Matriz ' })).toEqual({
      empresaId,
      nome: 'Matriz',
      ativo: true,
    });
  });

  it('lança 400 com details por campo, em português', () => {
    const error = captureError(() => pipe.transform({ nome: '' }));

    expect(error).toBeInstanceOf(ValidationException);
    expect((error as ValidationException).details).toEqual([
      { field: 'empresaId', message: 'Informe a empresa' },
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
