import { describe, test, assertType } from 'vitest';
import { BroadcastWebsocket } from './BroadcastWebsocket';

describe('BroadcastWebsocket Static Compliance', () => {
	test('should be assignable to WebSocket', () => {
		assertType<WebSocket>(new BroadcastWebsocket('ws://localhost'));
	});
});
