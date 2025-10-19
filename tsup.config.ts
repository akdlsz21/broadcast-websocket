import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/scripts/demo.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: false,
  splitting: false,
  target: 'es2020',
  outDir: 'dist',
  outExtension: (ctx) => ({ js: ctx.format === 'cjs' ? '.cjs' : '.js' }),
  // Keep module structure small and predictable
  shims: false,
});
