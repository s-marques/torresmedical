import type { TransactionHost } from '@nestjs-cls/transactional';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import type { AuditOptions } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';
import type { AuditService } from './audit.service';

const ID = '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';

function setup(options: AuditOptions | undefined, before: unknown = null) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(options),
  } as unknown as Reflector;
  const empresa = { findUnique: jest.fn().mockResolvedValue(before) };
  const withTransaction = jest.fn((fn: () => Promise<unknown>) => fn());
  const txHost = { tx: { empresa }, withTransaction } as unknown as TransactionHost<PrismaAdapter>;
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const interceptor = new AuditInterceptor(reflector, txHost, audit as unknown as AuditService);
  return { interceptor, empresa, withTransaction, audit };
}

function httpContext(method: string, params: Record<string, unknown> = {}, type = 'http') {
  return {
    getType: () => type,
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ method, params, query: { status: 'ativo' } }) }),
  } as unknown as ExecutionContext;
}

function handler(result: unknown): CallHandler & { handle: jest.Mock } {
  return { handle: jest.fn(() => of(result)) };
}

describe('AuditInterceptor', () => {
  it('não faz nada em handlers sem @Audit', async () => {
    const { interceptor, audit, withTransaction } = setup(undefined);

    await lastValueFrom(interceptor.intercept(httpContext('POST'), handler({ id: '1' })));

    expect(withTransaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('ignora contextos que não são HTTP', async () => {
    const { interceptor, audit } = setup({ entity: 'Empresa' });

    await lastValueFrom(
      interceptor.intercept(httpContext('POST', {}, 'rpc'), handler({ id: '1' })),
    );

    expect(audit.record).not.toHaveBeenCalled();
  });

  it('CREATE: grava na transação com o id do retorno e sem carregar before', async () => {
    const { interceptor, audit, empresa, withTransaction } = setup({ entity: 'Empresa' });

    const result = await lastValueFrom(
      interceptor.intercept(httpContext('POST'), handler({ id: ID, nome: 'A' })),
    );

    expect(result).toEqual({ id: ID, nome: 'A' });
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(empresa.findUnique).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith({
      action: 'CREATE',
      entity: 'Empresa',
      entityId: ID,
      before: null,
      after: { id: ID, nome: 'A' },
    });
  });

  it('UPDATE: carrega o before pelo :id antes do handler', async () => {
    const before = { id: ID, nome: 'A', passwordHash: 'x' };
    const { interceptor, audit, empresa } = setup({ entity: 'Empresa' }, before);
    const next = handler({ id: ID, nome: 'B' });
    next.handle.mockImplementation(() => {
      expect(empresa.findUnique).toHaveBeenCalledWith({ where: { id: ID } });
      return of({ id: ID, nome: 'B' });
    });

    await lastValueFrom(interceptor.intercept(httpContext('PATCH', { id: ID }), next));

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityId: ID,
        before,
        after: { id: ID, nome: 'B' },
      }),
    );
  });

  it('DELETE: grava after nulo e usa idParam/model customizados', async () => {
    const before = { id: ID };
    const { interceptor, audit, empresa } = setup(
      { entity: 'Clinica', model: 'Empresa', idParam: 'empresaId' },
      before,
    );

    await lastValueFrom(
      interceptor.intercept(httpContext('DELETE', { empresaId: ID }), handler(undefined)),
    );

    expect(empresa.findUnique).toHaveBeenCalledWith({ where: { id: ID } });
    expect(audit.record).toHaveBeenCalledWith({
      action: 'DELETE',
      entity: 'Clinica',
      entityId: ID,
      before,
      after: null,
    });
  });

  it('não consulta o banco com id que não é uuid (o pipe do handler responde 400)', async () => {
    const { interceptor, empresa } = setup({ entity: 'Empresa' });

    await lastValueFrom(
      interceptor.intercept(httpContext('PATCH', { id: 'abc' }), handler({ id: 'abc' })),
    );

    expect(empresa.findUnique).not.toHaveBeenCalled();
  });

  it('falha no handler propaga o erro e não grava auditoria', async () => {
    const { interceptor, audit } = setup({ entity: 'Empresa' });
    const erro = new Error('falhou');

    await expect(
      lastValueFrom(
        interceptor.intercept(httpContext('POST'), { handle: () => throwError(() => erro) }),
      ),
    ).rejects.toBe(erro);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('falha ao gravar a auditoria propaga o erro (a transação é desfeita)', async () => {
    const { interceptor, audit } = setup({ entity: 'Empresa' });
    audit.record.mockRejectedValue(new Error('banco fora'));

    await expect(
      lastValueFrom(interceptor.intercept(httpContext('POST'), handler({ id: ID }))),
    ).rejects.toThrow('banco fora');
  });

  it('CREATE sem id no retorno é erro de programação', async () => {
    const { interceptor } = setup({ entity: 'Empresa' });

    await expect(
      lastValueFrom(interceptor.intercept(httpContext('POST'), handler({ nome: 'A' }))),
    ).rejects.toThrow(/retornar a entidade com id/);
  });

  it('model inexistente é erro de programação', async () => {
    const { interceptor } = setup({ entity: 'Inexistente' });

    await expect(
      lastValueFrom(interceptor.intercept(httpContext('PATCH', { id: ID }), handler({ id: ID }))),
    ).rejects.toThrow(/model Prisma "Inexistente"/);
  });

  it('EXPORT: grava os filtros depois do handler, sem transação', async () => {
    const { interceptor, audit, withTransaction } = setup({ entity: 'Empresa', action: 'EXPORT' });

    const result = await lastValueFrom(interceptor.intercept(httpContext('GET'), handler('xlsx')));

    expect(result).toBe('xlsx');
    expect(withTransaction).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith({
      action: 'EXPORT',
      entity: 'Empresa',
      entityId: '*',
      after: { filtros: { status: 'ativo' } },
    });
  });

  it('não executa nada antes da inscrição no observable', () => {
    const { interceptor, withTransaction } = setup({ entity: 'Empresa' });

    interceptor.intercept(httpContext('POST'), handler({ id: ID }));

    expect(withTransaction).not.toHaveBeenCalled();
  });
});
