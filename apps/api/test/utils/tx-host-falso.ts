import type { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaAdapter } from '../../src/common/prisma/prisma-transaction';

/** Query padrão de lookup já validada (página 1, 10 itens, ordem por nome). */
export const CONSULTA_LOOKUP = {
  page: 1,
  pageSize: 10,
  sort: { field: 'nome', direction: 'asc' },
  search: undefined,
} as const;

/** `txHost` falso com um delegate Prisma (`findMany`, `count`, `findFirst`) para testes unitários. */
export function txHostFalso<R>(modelo: string, registros: R[]) {
  const delegate = {
    findMany: jest.fn().mockResolvedValue(registros),
    count: jest.fn().mockResolvedValue(registros.length),
    findFirst: jest.fn().mockResolvedValue(registros[0] ?? null),
  };
  const txHost = { tx: { [modelo]: delegate } } as unknown as TransactionHost<PrismaAdapter>;
  return { txHost, delegate };
}
