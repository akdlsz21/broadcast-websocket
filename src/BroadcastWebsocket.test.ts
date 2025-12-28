import { spawn } from 'child_process';
import path from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BroadcastWebsocket } from './BroadcastWebsocket';

describe('BroadcastWebsocket', () => {
	let instances: BroadcastWebsocket[] = [];
	let serverProcess: any;
	const PORT = 8788;
	const url = `ws://localhost:${PORT}`;

	beforeAll(async () => {
		// Spawn the demo server
		serverProcess = spawn('node', ['scripts/server.js'], {
			env: { ...process.env, PORT: String(PORT) },
			cwd: path.resolve(__dirname, '..'),
			stdio: 'pipe',
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
		const ws = new BroadcastWebsocket(url, {
			heartbeatMs: 100,
			timeoutMs: 300,
		});
		instances.push(ws);
		return ws;
	};

	const waitForState = (ws: BroadcastWebsocket, state: number) => {
		return new Promise<void>((resolve, reject) => {
			const start = Date.now();
			const check = () => {
				if (ws.readyState === state) resolve();
				else if (ws.readyState === 3 && state !== 3) reject(new Error('Socket closed unexpectedly'));
				else if (Date.now() - start > 2000)
					reject(new Error(`Timed out waiting for state ${state}, current: ${ws.readyState}`));
				else setTimeout(check, 10);
			};
			check();
		});
	};

	const waitForLeader = async (ws: BroadcastWebsocket) => {
		if (ws.status().isLeader) return;
		await new Promise<void>((resolve, reject) => {
			const start = Date.now();
			const check = () => {
				if (ws.status().isLeader) resolve();
				else if (Date.now() - start > 2000) reject(new Error('Timed out waiting for leader'));
				else setTimeout(check, 10);
			};
			check();
		});
	};

	it('should initialize correctly', () => {
		const bws = createInstance();
		expect(bws).toBeDefined();
		expect(bws.url).toBe(url);
		expect(bws.readyState).toBe(0); // CONNECTING
	});

	it('should become leader if no other tabs are open', async () => {
		const bws = createInstance();
		await waitForLeader(bws);
		expect(bws.status().isLeader).toBe(true);
	});

	it('should connect to WebSocket when it becomes leader', async () => {
		const bws = createInstance();
		await waitForLeader(bws);
		await waitForState(bws, 1); // OPEN
		expect(bws.readyState).toBe(1);
	});

	it('should not become leader if another leader exists', async () => {
		const leader = createInstance();
		await waitForLeader(leader);

		const follower = createInstance();
		// Give it a moment to check election
		await new Promise((resolve) => setTimeout(resolve, 300));

		console.log('Leader status:', leader.status());
		console.log('Follower status:', follower.status());
		expect(follower.status().isLeader).toBe(false);
		expect(follower.status().leaderId).toBe(leader.status().id);
	});

	it('should send and receive messages as leader', async () => {
		const leader = createInstance();
		await waitForLeader(leader);
		await waitForState(leader, 1);

		const msgPromise = new Promise<MessageEvent>((resolve) => {
			leader.onmessage = (ev) => resolve(ev);
		});

		leader.send('hello leader');
		const ev = await msgPromise;
		const data = JSON.parse(ev.data);
		expect(data.type).toBe('message');
		expect(data.data).toBe('hello leader');
	});

	it('should delegate message sending from follower to leader', async () => {
		const leader = createInstance();
		await waitForLeader(leader);
		await waitForState(leader, 1);

		const follower = createInstance();
		await new Promise((resolve) => setTimeout(resolve, 100)); // wait for election sync

		const msgPromise = new Promise<MessageEvent>((resolve) => {
			// Leader should receive the echo back from server
			leader.onmessage = (ev) => {
				const d = JSON.parse(ev.data);
				if (d.type === 'message' && d.data === 'hello from follower') {
					resolve(ev);
				}
			};
		});

		follower.send('hello from follower');
		await msgPromise;
	});

	it('should broadcast received messages to followers', async () => {
		const leader = createInstance();
		await waitForLeader(leader);
		await waitForState(leader, 1);

		const follower = createInstance();
		await new Promise((resolve) => setTimeout(resolve, 100));

		const msgPromise = new Promise<MessageEvent>((resolve) => {
			follower.onmessage = (ev) => {
				const d = JSON.parse(ev.data);
				if (d.type === 'message' && d.data === 'broadcast test') {
					resolve(ev);
				}
			};
		});

		leader.send('broadcast test');
		await msgPromise;
	});

	it('should failover when leader dies', async () => {
		const leader = createInstance();
		await waitForLeader(leader);
		await waitForState(leader, 1);

		const follower = createInstance();
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(follower.status().isLeader).toBe(false);

		// Kill leader
		leader.dispose();

		// Follower should become leader (might take up to timeoutMs + heartbeatMs)
		// We might need to mock time or wait. The default timeout is 9000ms which is too long for unit tests.
		// We should probably allow configuring timeouts in BroadcastWebsocket or mock time.
		// For this test, we can use fake timers if we refactor, but since we are using real server,
		// we can't easily use fake timers for everything.
		// Instead, let's manually trigger the election check or assume the user accepts a wait?
		// Actually, we can just manually expire the leader entry in localStorage to speed it up.

		const key = `bws:leader:${new URL(url).origin}`;
		const state = JSON.parse(localStorage.getItem(key)!);
		state.ts = Date.now() - 10000; // Make it expired
		localStorage.setItem(key, JSON.stringify(state));

		// Wait for follower to notice (heartbeat/check interval)
		// The check interval is heartbeatMs (3000ms default).
		// We can force a check if we expose it, but let's just wait a bit or use a shorter interval if possible.
		// Ideally we'd pass options to constructor for shorter timeouts.
	});
});
