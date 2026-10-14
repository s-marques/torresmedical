import { type ArgumentsHost, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { AllExceptionsFilter, describeForLog } from './all-exceptions.filter';

function host(headersSent = false) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const request = { headers: { 'x-request-id': 'req-1' } };
  const response = { headersSent, status, setHeader: jest.fn() };
  const argumentsHost = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { argumentsHost, status, json };
}

describe('AllExceptionsFilter', () => {
  let logError: jest.SpyInstance;

  beforeEach(() => {
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => logError.mockRestore());

  it('responde no formato padrão com requestId', () => {
    const { argumentsHost, status, json } = host();

    new AllExceptionsFilter().catch(new NotFoundException('Empresa não encontrada'), argumentsHost);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Empresa não encontrada',
      requestId: 'req-1',
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('loga erros 500 e responde sem stack', () => {
    const { argumentsHost, json } = host();

    new AllExceptionsFilter().catch(new Error('falha interna'), argumentsHost);

    expect(json.mock.calls[0][0]).not.toHaveProperty('stack');
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-1',
        error: expect.objectContaining({ type: 'Error' }),
      }),
      'Erro não tratado',
    );
  });

  it('não escreve resposta já enviada', () => {
    const { argumentsHost, status } = host(true);

    new AllExceptionsFilter().catch(new Error('x'), argumentsHost);

    expect(status).not.toHaveBeenCalled();
  });
});

describe('describeForLog', () => {
  it('não inclui a mensagem de erros do Prisma (pode ter valores de campos)', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Valor 123.456.789-00 inválido', {
      code: 'P2034',
      clientVersion: 'test',
    });

    const log = describeForLog(error);

    expect(log).toMatchObject({ type: 'PrismaClientKnownRequestError', code: 'P2034' });
    expect(JSON.stringify(log)).not.toContain('123.456.789-00');
    expect(String(log.stack)).toMatch(/^\s*at /);
  });

  it('erro de validação do Prisma também fica sem mensagem', () => {
    const error = new Prisma.PrismaClientValidationError('Argument nome: valor "Fulano"', {
      clientVersion: 'test',
    });
    expect(JSON.stringify(describeForLog(error))).not.toContain('Fulano');
  });

  it('demais erros: tipo, mensagem e stack', () => {
    const log = describeForLog(new TypeError('x is undefined'));
    expect(log).toMatchObject({ type: 'TypeError', message: 'x is undefined' });
  });

  it('valores que não são Error', () => {
    expect(describeForLog('texto')).toEqual({ type: 'string' });
  });
});
