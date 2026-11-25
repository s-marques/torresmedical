/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// No Docker o alvo é o container da API (http://api:3000); fora dele, a API local.
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      // xfwd: repassa o IP do navegador (X-Forwarded-For) para o rate limit e a auditoria.
      '/api': { target: apiProxyTarget, changeOrigin: true, xfwd: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Os testes de layout (e2e/, Playwright) rodam à parte: pnpm test:layout.
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    // Cada worker jsdom ocupa centenas de MB: sem limite, o Vitest abre um por núcleo e esgota a RAM.
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      // Caminhos relativos à raiz do repo, como o Sonar espera.
      reporter: ['text-summary', ['lcov', { projectRoot: '../..' }]],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/test/**', 'src/**/*.test.{ts,tsx}'],
    },
  },
});
