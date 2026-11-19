import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { ApiException, BusinessException, ValidationException } from './api.exception';
import { INTERNAL_ERROR_MESSAGE } from './error-codes';
import { toApiError } from './to-api-error';

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('Mensagem interna com valor 123.456.789-00', {
    code,
    clientVersion: 'test',
    meta,
  });
}

describe('toApiError', () => {
  it('ValidationException: 400 com details', () => {
    const body = toApiError(
      new ValidationException([{ field: 'nome', message: 'Informe o nome' }]),
    );

    expect(body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos',
      details: [{ field: 'nome', message: 'Informe o nome' }],
    });
  });

  it('BusinessException: 422 por padrão, com código próprio', () => {
    expect(toApiError(new BusinessException('SALDO_INSUFICIENTE', 'Saldo insuficiente'))).toEqual({
      statusCode: 422,
      code: 'SALDO_INSUFICIENTE',
      message: 'Saldo insuficiente',
    });
  });

  it('BusinessException aceita outro status', () => {
    const body = toApiError(new BusinessException('DUP', 'Duplicado', { status: 409 }));
    expect(body.statusCode).toBe(409);
  });

  it('ApiException 5xx nunca expõe a mensagem', () => {
    const body = toApiError(new ApiException(503, 'FORA', 'host db-01 fora do ar'));
    expect(body).toEqual({ statusCode: 503, code: 'FORA', message: INTERNAL_ERROR_MESSAGE });
  });

  it.each([
    [new NotFoundException(), 404, 'NOT_FOUND', 'Recurso não encontrado'],
    [new NotFoundException('Cannot GET /api/x'), 404, 'NOT_FOUND', 'Recurso não encontrado'],
    [new ForbiddenException(), 403, 'FORBIDDEN', 'Sem permissão'],
    [
      new BadRequestException('Validation failed (uuid is expected)'),
      400,
      'VALIDATION_ERROR',
      'Dados inválidos',
    ],
    [
      new HttpException('Too Many Requests', 429),
      429,
      'TOO_MANY_REQUESTS',
      expect.stringContaining('Muitas'),
    ],
    [new HttpException('x', 418), 418, 'BAD_REQUEST', 'x'],
  ])(
    'HttpException do Nest vira código e mensagem em português (%#)',
    (exception, status, code, message) => {
      expect(toApiError(exception)).toEqual({ statusCode: status, code, message });
    },
  );

  it('mantém a mensagem própria de uma HttpException', () => {
    expect(toApiError(new NotFoundException('Empresa não encontrada')).message).toBe(
      'Empresa não encontrada',
    );
    expect(toApiError(new BadRequestException(['a', 'b'])).message).toBe('a; b');
  });

  it('HttpException 5xx esconde a mensagem', () => {
    expect(toApiError(new InternalServerErrorException('SELECT * FROM pacientes')).message).toBe(
      INTERNAL_ERROR_MESSAGE,
    );
  });

  it('P2002 vira 409 DUPLICATE com o campo', () => {
    const error = prismaError('P2002', { target: ['documento'] });
    expect(toApiError(error)).toEqual({
      statusCode: 409,
      code: 'DUPLICATE',
      message: 'Registro duplicado',
      details: [
        {
          field: 'documento',
          message: 'Já existe um registro com este valor',
          code: 'validacao.duplicado',
        },
      ],
    });
  });

  it('P2025 vira 404 NOT_FOUND e P2003 vira 409 RELATION_CONFLICT', () => {
    expect(toApiError(prismaError('P2025'))).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(toApiError(prismaError('P2003'))).toMatchObject({
      statusCode: 409,
      code: 'RELATION_CONFLICT',
    });
  });

  it('outros erros do Prisma viram 500 sem a mensagem interna', () => {
    const body = toApiError(prismaError('P2034'));
    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: INTERNAL_ERROR_MESSAGE,
    });
  });

  it('URIError do Express não expõe a mensagem em inglês', () => {
    expect(toApiError(new BadRequestException('URI malformed')).message).toBe('Dados inválidos');
  });

  it('qualquer outro erro vira 500 genérico', () => {
    expect(toApiError(new Error('stack com dados'))).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: INTERNAL_ERROR_MESSAGE,
    });
    expect(toApiError(null).statusCode).toBe(500);
  });
});
