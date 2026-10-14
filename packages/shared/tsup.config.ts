import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  // No watch não limpa: a API e o web leem o dist enquanto ele é regerado.
  clean: !options.watch,
  sourcemap: true,
}));
