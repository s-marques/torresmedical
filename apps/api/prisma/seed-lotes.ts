import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Prisma } from '../src/generated/prisma/client';

/**
 * Lotes fictícios da tela Lotes / Validade (issue #22). Gerados por último em `buildSeedData`,
 * para não mudar os ids dos demais dados. O vencimento é relativo a `agora`, para a tela sempre
 * ter lotes vencidos, vencendo em até 60 dias e válidos.
 */

export type SeedLote = Prisma.LoteUncheckedCreateInput & { id: string };

/** Dias até o vencimento de cada lote (negativo: já vencido). */
const VENCIMENTOS_DIAS = [-20, -3, 5, 25, 45, 59, 90, 180, 240, 365, 400, 720];

const DIA_MS = 24 * 60 * 60 * 1000;

export function buildSeedLotes(produtoIds: readonly string[], agora: Date): SeedLote[] {
  if (produtoIds.length === 0) return [];
  const hoje = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  return VENCIMENTOS_DIAS.map((dias, i) => ({
    id: faker.string.uuid(),
    produtoId: produtoIds[i % produtoIds.length] ?? '',
    numero: `LOT-${faker.string.alphanumeric({ length: 6, casing: 'upper' })}`,
    dataVencimento: new Date(hoje + dias * DIA_MS),
    quantidade: faker.number.int({ min: 1, max: 200 }),
  }));
}

/** Idempotente: upsert pelos ids determinísticos. */
export async function applySeedLotes(
  tx: Prisma.TransactionClient,
  lotes: readonly SeedLote[],
): Promise<void> {
  for (const lote of lotes) {
    await tx.lote.upsert({ where: { id: lote.id }, create: lote, update: lote });
  }
}
