import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
	plugins: [react()],
	resolve: {
		preserveSymlinks: true,
	},
	optimizeDeps: {
		exclude: ['broadcast-websocket'],
	},
	server: {
		fs: {
			allow: [
				// allow monorepo root (adjust to your repo root path)
				path.resolve(__dirname, '../..'),
			],
		},
		watch: {
			ignored: ['**/node_modules/**', '!**/node_modules/broadcast-websocket/**'],
		},
	},
});
