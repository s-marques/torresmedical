import { Prisma } from '../../generated/prisma/client';
import { fromPrismaError, uniqueFields } from './prisma-errors';

function p2002(meta: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: 'test',
    meta,
  });
}

describe('uniqueFields', () => {
  it('lê o índice informado pelo driver adapter e converte para camelCase', () => {
    const error = p2002({
      driverAdapterError: {
        cause: { constraint: { index: 'usuarios_empresa_id_key' }, table: 'usuarios' },
      },
    });
    expect(uniqueFields(error)).toEqual(['empresaId']);
  });

  it('prefere os campos explícitos da constraint', () => {
    const error = p2002({ driverAdapterError: { cause: { constraint: { fields: ['"email"'] } } } });
    expect(uniqueFields(error)).toEqual(['email']);
  });

  it('aceita target em texto ou lista', () => {
    expect(uniqueFields(p2002({ target: 'cpf' }))).toEqual(['cpf']);
    expect(uniqueFields(p2002({ target: ['empresa_id', 'nome'] }))).toEqual(['empresaId', 'nome']);
  });

  it('sem informação, não inventa campo', () => {
    expect(uniqueFields(p2002({}))).toEqual([]);
    expect(
      uniqueFields(
        p2002({
          driverAdapterError: { cause: { constraint: { index: 'idx_custom' }, table: 't' } },
        }),
      ),
    ).toEqual([]);
    expect(fromPrismaError(p2002({}))?.details).toBeUndefined();
  });

  it('ignora erros que não são do Prisma', () => {
    expect(fromPrismaError(new Error('x'))).toBeUndefined();
  });
});
