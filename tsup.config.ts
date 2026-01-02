import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm', 'cjs'],
	dts: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	splitting: false,
	target: 'es2020',
	outDir: 'dist',
	outExtension: (ctx) => ({ js: ctx.format === 'cjs' ? '.cjs' : '.js' }),
	// Keep module structure small and predictable
	shims: false,
});
