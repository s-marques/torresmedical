import type { Prisma } from '../../../generated/prisma/client';
import { EXPORT_TIME_ZONE } from '../../../common/export/export-values';

/** Só produtos (não serviços) e não excluídos entram no estoque. */
export const PRODUTOS_ESTOQUE = {
  deletedAt: null,
  tipo: 'PRODUTO',
} as const satisfies Prisma.ProdutoWhereInput;

/**
 * Produto controlado com mínimo definido e saldo ≤ mínimo (o mesmo de `abaixoDoMinimo`, no
 * banco). Usado pelos cards das telas Estoque e Lotes / Validade.
 */
export function filtroAbaixoMinimo(
  estoqueMinimo: Prisma.FieldRef<'Produto', 'Decimal'>,
): Prisma.ProdutoWhereInput {
  return {
    ...PRODUTOS_ESTOQUE,
    controlaEstoque: true,
    estoqueMinimo: { gt: 0 },
    estoqueAtual: { lte: estoqueMinimo },
  };
}

const DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: EXPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Hoje (`AAAA-MM-DD`) no fuso da clínica: referência dos vencimentos dos lotes. */
export function hojeNaClinica(agora: Date = new Date()): string {
  return DIA.format(agora);
}

/** Data `AAAA-MM-DD` como o `Date` de uma coluna `@db.Date` (meia-noite UTC). */
export function dataDoBanco(data: string): Date {
  return new Date(`${data}T00:00:00.000Z`);
}
