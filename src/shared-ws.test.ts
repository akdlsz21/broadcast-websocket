import { spawn } from 'child_process';
import path from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedWsTransport } from './shared-ws';
import type { BusPayload } from './types';

describe('SharedWsTransport', () => {
	let instances: SharedWsTransport[] = [];
	let serverProcess: any;
	const PORT = 8788;
	const url = `ws://localhost:${PORT}`;

	beforeAll(async () => {
		serverProcess = spawn('node', ['scripts/server.js'], {
			env: { ...process.env, PORT: String(PORT) },
			cwd: path.resolve(__dirname, '..'),
			stdio: 'pipe',
		});

		await new Promise<void>((resolve, reject) => {
			serverProcess.stdout.on('data', (data: Buffer) => {
				if (data.toString().toLowerCase().includes('listening')) {
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
		localStorage.clear();
		vi.clearAllMocks();
		instances = [];
	});

	afterEach(() => {
		instances.forEach((i) => {
			i.dispose();
		});
	});

	const createInstance = () => {
		const ws = new SharedWsTransport(url, {
			heartbeatMs: 100,
			timeoutMs: 300,
		});
		instances.push(ws);
		return ws;
	};

	const waitForTransportState = (ws: SharedWsTransport, state: SharedWsTransport['transportState']) => {
		return new Promise<void>((resolve, reject) => {
			const start = Date.now();
			const check = () => {
				if (ws.transportState === state) resolve();
				else if (Date.now() - start > 2000)
					reject(new Error(`Timed out waiting for state ${state}, current: ${ws.transportState}`));
				else setTimeout(check, 10);
			};
			check();
		});
	};

	const waitForRole = (ws: SharedWsTransport, role: SharedWsTransport['role']) => {
		if (ws.role === role) return Promise.resolve();
		return new Promise<void>((resolve, reject) => {
			const start = Date.now();
			const check = () => {
				if (ws.role === role) resolve();
				else if (Date.now() - start > 2000) reject(new Error(`Timed out waiting for role ${role}`));
				else setTimeout(check, 10);
			};
			check();
		});
	};

	const parsePayload = (payload: BusPayload) => {
		if (typeof payload === 'string') return JSON.parse(payload);
		const text =
			typeof TextDecoder !== 'undefined'
				? new TextDecoder().decode(payload)
				: Buffer.from(payload).toString('utf8');
		return JSON.parse(text);
	};

	it('should initialize correctly', () => {
		const shared = createInstance();
		expect(shared).toBeDefined();
		expect(shared.url).toBe(url);
		expect(['connecting', 'open', 'closing', 'closed']).toContain(shared.transportState);
	});

	it('should become leader if no other tabs are open', async () => {
		const shared = createInstance();
		await waitForRole(shared, 'leader');
		expect(shared.status().role).toBe('leader');
	});

	it('should connect to WebSocket when it becomes leader', async () => {
		const shared = createInstance();
		await waitForRole(shared, 'leader');
		await waitForTransportState(shared, 'open');
		expect(shared.transportState).toBe('open');
	});

	it('should not become leader if another leader exists', async () => {
		const leader = createInstance();
		await waitForRole(leader, 'leader');

		const follower = createInstance();
		await waitForRole(follower, 'follower');

		expect(follower.status().role).toBe('follower');
		expect(follower.status().leaderId).toBe(leader.status().id);
	});

	it('should send and receive messages as leader', async () => {
		const leader = createInstance();
		await waitForRole(leader, 'leader');
		await waitForTransportState(leader, 'open');

		const msgPromise = new Promise<BusPayload>((resolve) => {
			leader.addEventListener('message', (event) => {
				const detail = (event as CustomEvent<{ data: BusPayload }>).detail;
				resolve(detail.data);
			});
		});

		leader.send('hello leader');
		const payload = await msgPromise;
		const data = parsePayload(payload);
		expect(data.type).toBe('message');
		expect(data.data).toBe('hello leader');
	});

	it('should delegate message sending from follower to leader', async () => {
		const leader = createInstance();
		await waitForRole(leader, 'leader');
		await waitForTransportState(leader, 'open');

		const follower = createInstance();
		await waitForRole(follower, 'follower');
		await waitForTransportState(follower, 'open');

		const msgPromise = new Promise<BusPayload>((resolve) => {
			leader.addEventListener('message', (event) => {
				const detail = (event as CustomEvent<{ data: BusPayload }>).detail;
				const data = parsePayload(detail.data);
				if (data.type === 'message' && data.data === 'hello from follower') {
					resolve(detail.data);
				}
			});
		});

		follower.send('hello from follower');
		await msgPromise;
	});

	it('should broadcast received messages to followers', async () => {
		const leader = createInstance();
		await waitForRole(leader, 'leader');
		await waitForTransportState(leader, 'open');

		const follower = createInstance();
		await waitForRole(follower, 'follower');
		await waitForTransportState(follower, 'open');

		const msgPromise = new Promise<BusPayload>((resolve) => {
			follower.addEventListener('message', (event) => {
				const detail = (event as CustomEvent<{ data: BusPayload }>).detail;
				const data = parsePayload(detail.data);
				if (data.type === 'message' && data.data === 'broadcast test') {
					resolve(detail.data);
				}
			});
		});

		leader.send('broadcast test');
		await msgPromise;
	});

	it('should failover when leader detaches', async () => {
		const leader = createInstance();
		await waitForRole(leader, 'leader');
		await waitForTransportState(leader, 'open');

		const follower = createInstance();
		await waitForRole(follower, 'follower');

		leader.dispose();
		await waitForRole(follower, 'leader');
	});
});
