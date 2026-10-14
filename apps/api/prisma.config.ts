import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Sem env() do prisma/config: ele exige a variável até no "generate", que não conecta.
    url: process.env.DATABASE_URL ?? '',
  },
});
