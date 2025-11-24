import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { BroadcastWebsocket } from './BroadcastWebsocket';
import { spawn } from 'child_process';
import path from 'path';

describe('BroadcastWebsocket', () => {
	let bws: BroadcastWebsocket;
	let serverProcess: any;
	const PORT = 8788; // Use a different port for testing to avoid conflicts
	const url = `ws://localhost:${PORT}`;

	beforeAll(async () => {
		// Spawn the demo server
		serverProcess = spawn('node', ['scripts/server.js'], {
			env: { ...process.env, PORT: String(PORT) },
			cwd: path.resolve(__dirname, '..'),
			stdio: 'pipe', // Capture output to know when it's ready
		});

		// Wait for server to be ready
		await new Promise<void>((resolve, reject) => {
			serverProcess.stdout.on('data', (data: Buffer) => {
				if (data.toString().toLowerCase().includes('listening')) {
					console.log(`Test server started on ${url}`);
					resolve();
				}
			});
			serverProcess.stderr.on('data', (data: Buffer) => {
				console.error(`Server error: ${data}`);
			});
			serverProcess.on('error', (err: any) => reject(err));
			serverProcess.on('exit', (code: number) => {
				if (code !== 0 && code !== null) reject(new Error(`Server exited with code ${code}`));
			});
		});
	});

	afterAll(() => {
		if (serverProcess) {
			serverProcess.kill();
		}
	});

	beforeEach(() => {
		// Clear localStorage before each test to ensure clean leader election
		localStorage.clear();
		vi.clearAllMocks();
	});

	afterEach(() => {
		if (bws) {
			bws.dispose();
		}
	});

	const waitForState = (ws: BroadcastWebsocket, state: number) => {
		return new Promise<void>((resolve, reject) => {
			const start = Date.now();
			const check = () => {
				if (ws.readyState === state) resolve();
				else if (ws.readyState === 3 && state !== 3) reject(new Error('Socket closed unexpectedly'));
				else if (Date.now() - start > 2000) reject(new Error(`Timed out waiting for state ${state}, current: ${ws.readyState}`));
				else setTimeout(check, 10);
			};
			check();
		});
	};

	it('should initialize correctly', () => {
		bws = new BroadcastWebsocket(url);
		expect(bws).toBeDefined();
		expect(bws.url).toBe(url);
		expect(bws.readyState).toBe(0); // CONNECTING
	});

	it('should become leader if no other tabs are open', async () => {
		bws = new BroadcastWebsocket(url);

		// Wait for leader election
		await new Promise((resolve) => setTimeout(resolve, 100));

		const status = bws.status();
		expect(status.isLeader).toBe(true);
		expect(status.leaderId).toBe(status.id);
	});

	it('should connect to WebSocket when it becomes leader', async () => {
		bws = new BroadcastWebsocket(url);

		// Wait for leader election and connection
		await waitForState(bws, 1); // OPEN

		expect(bws.readyState).toBe(1); // OPEN
	});

	it('should not become leader if another leader exists', async () => {
		// Simulate an existing leader in localStorage
		const otherLeaderId = 'other-id';
		const key = `bws:leader:${new URL(url).origin}`;
		localStorage.setItem(key, JSON.stringify({ id: otherLeaderId, ts: Date.now() }));

		bws = new BroadcastWebsocket(url);

		await new Promise((resolve) => setTimeout(resolve, 100));

		const status = bws.status();
		expect(status.isLeader).toBe(false);
		expect(status.leaderId).toBe(otherLeaderId);
	});
});
