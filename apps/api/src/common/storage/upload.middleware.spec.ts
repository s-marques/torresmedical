import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ValidationException } from '../errors/api.exception';
import { toUploadError, UploadMiddleware } from './upload.middleware';

describe('toUploadError', () => {
  it('tamanho acima do limite do uso', () => {
    expect(toUploadError(new MulterError('LIMIT_FILE_SIZE'), 'nfe-xml').details).toEqual([
      { field: 'arquivo', message: 'O arquivo deve ter no máximo 5 MB' },
    ]);
  });

  it('campo errado ou mais de um arquivo', () => {
    for (const code of ['LIMIT_UNEXPECTED_FILE', 'LIMIT_FILE_COUNT'] as const) {
      expect(toUploadError(new MulterError(code), 'avatar').details).toEqual([
        { field: 'arquivo', message: 'Envie um único arquivo no campo "arquivo"' },
      ]);
    }
  });

  it('multipart malformado e outros erros', () => {
    for (const error of [
      new MulterError('LIMIT_PART_COUNT'),
      new Error('Unexpected end of form'),
    ]) {
      expect(toUploadError(error, 'avatar').details).toEqual([
        { field: 'arquivo', message: 'Não foi possível ler o arquivo enviado' },
      ]);
    }
  });
});

describe('UploadMiddleware', () => {
  function run(req: Partial<Request>, authorization: string | null = 'Bearer token'): unknown {
    const next = jest.fn() as jest.MockedFunction<NextFunction>;
    new UploadMiddleware().use(
      { headers: { authorization: authorization ?? undefined }, ...req } as Request,
      {} as Response,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    return next.mock.calls[0]?.[0];
  }

  it('sem Bearer não lê o corpo: o guard responde 401', () => {
    const is = jest.fn();

    expect(run({ query: { uso: 'x' }, is }, null)).toBeUndefined();
    expect(is).not.toHaveBeenCalled();
  });

  it('400 para uso ausente ou inválido, antes de ler o corpo', () => {
    const error = run({ query: { uso: 'x' }, is: jest.fn() });

    expect(error).toBeInstanceOf(ValidationException);
    expect((error as ValidationException).details).toEqual([
      { field: 'uso', message: 'Uso de arquivo inválido' },
    ]);
  });

  it('400 quando o corpo não é multipart', () => {
    const error = run({ query: { uso: 'avatar' }, is: jest.fn().mockReturnValue(false) });

    expect((error as ValidationException).details).toEqual([
      { field: 'arquivo', message: 'Selecione um arquivo' },
    ]);
  });
});
