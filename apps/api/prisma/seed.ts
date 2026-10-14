import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { applySeed } from './seed-data';

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const { unidades, usuarios } = await applySeed(prisma);
    // Só contagens: nada de dados pessoais no log (CLAUDE.md, seção 6).
    console.log(`Seed: 1 empresa, ${unidades.length} unidades, ${usuarios.length} usuários.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed falhou:', error instanceof Error ? error.message : error);
  process.exit(1);
});
