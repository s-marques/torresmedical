import { defineConfig } from '@playwright/test';

const PORTA = 4173;

/**
 * Testes de layout no celular (issue #161): rodam num Chromium real, porque o jsdom não calcula
 * layout. A API é simulada por rota (`e2e/api-falsa.ts`), então não precisam de Postgres.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: `http://localhost:${PORTA}` },
  webServer: {
    // Build + preview: o dev server compila sob demanda e deixa a primeira carga lenta demais.
    command: `pnpm exec vite build && pnpm exec vite preview --port ${PORTA} --strictPort --host localhost`,
    url: `http://localhost:${PORTA}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
