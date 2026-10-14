import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // Caminhos relativos à raiz do repo, como o Sonar espera.
      reporter: ['text-summary', ['lcov', { projectRoot: '../..' }]],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});
