import type { PrismaService } from '../../src/common/prisma/prisma.service';

/** Limpa as tabelas entre testes e2e (o banco de teste é exclusivo dos testes). */
export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE audit_log, usuarios, unidades, empresas RESTART IDENTITY CASCADE',
  );
}
