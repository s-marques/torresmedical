import { createUnidadeSchema, mensagemObrigatoria, textoObrigatorio } from '@torres/shared';
import { z } from 'zod';
import { ValidationException } from '../errors/api.exception';
import { validarComCodigos, zodIssuesToDetails } from './zod-issues';
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
      { field: 'extra', message: 'Campo não permitido', code: 'validacao.campoNaoPermitido' },
      { field: 'outro', message: 'Campo não permitido', code: 'validacao.campoNaoPermitido' },
    ]);
  });
});

describe('validarComCodigos', () => {
  it('mensagens por chave: texto em português com code e params (issue #205)', () => {
    const schema = z.object({ nome: textoObrigatorio('Nome', { max: 3 }), idade: z.number() });
    const result = validarComCodigos(schema, { nome: 'abcd' });

    expect(zodIssuesToDetails(result.error?.issues ?? [])).toEqual([
      {
        field: 'nome',
        message: 'Nome deve ter no máximo 3 caracteres',
        code: 'validacao.campoMax',
        params: { campo: 'Nome', count: 3 },
      },
      { field: 'idade', message: 'Campo obrigatório', code: 'validacao.campoObrigatorio' },
    ]);
  });

  it('mensagem literal do schema segue sem code e o tradutor volta ao português', () => {
    const result = validarComCodigos(z.string().min(1, { error: 'Informe o nome' }), '');

    expect(zodIssuesToDetails(result.error?.issues ?? [])).toEqual([
      { field: '', message: 'Informe o nome' },
    ]);
    expect(mensagemObrigatoria('Nome')).toBe('Nome é obrigatório.');
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
