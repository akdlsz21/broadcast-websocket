import { describe, expect, it } from 'vitest';
import { SharedWsTransport } from '../src/shared-ws';

describe('SharedWsTransport Runtime Surface', () => {
	const url = 'ws://localhost:1234';

	it('should expose required methods', () => {
		const shared = new SharedWsTransport(url);
		expect(typeof shared.send).toBe('function');
		expect(typeof shared.detach).toBe('function');
		expect(typeof shared.dispose).toBe('function');
		expect(typeof shared.terminate).toBe('function');
		expect(typeof shared.status).toBe('function');
		shared.dispose();
	});

	it('should expose state properties and status snapshot', () => {
		const shared = new SharedWsTransport(url);
		const status = shared.status();
		expect(status.url).toBe(url);
		expect(['leader', 'follower']).toContain(shared.role);
		expect(['connecting', 'open', 'closing', 'closed']).toContain(shared.transportState);
		expect(['connecting', 'open', 'closing', 'closed']).toContain(status.transportState);
		shared.dispose();
	});
});
