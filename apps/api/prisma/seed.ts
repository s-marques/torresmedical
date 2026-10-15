import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { applySeed } from './seed-data';

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const senhaAdmin = process.env.SEED_ADMIN_PASSWORD;
  if (!senhaAdmin) throw new Error('Defina SEED_ADMIN_PASSWORD (senha de admin@example.com).');
  try {
    const { unidades, usuarios } = await applySeed(prisma, senhaAdmin);
    // Só contagens: nada de dados pessoais no log (CLAUDE.md, seção 6).
    console.log(
      `Seed: 1 empresa, ${unidades.length} unidades, ${usuarios.length + 1} usuários ` +
        '(admin@example.com com o perfil Administrador).',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed falhou:', error instanceof Error ? error.message : error);
  process.exit(1);
});
