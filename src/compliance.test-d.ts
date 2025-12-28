import { describe, test, assertType } from 'vitest';
import { BroadcastWebsocket } from './BroadcastWebsocket';

describe('BroadcastWebsocket Static Compliance', () => {
	test('should be assignable to WebSocket', () => {
		// This is the ultimate test: if instances are assignable to WebSocket, it complies.
		assertType<WebSocket>(new BroadcastWebsocket('ws://localhost'));
	});
});
