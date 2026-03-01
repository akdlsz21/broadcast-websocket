import { assertType, describe, test } from 'vitest';
import type { Role, StatusSnapshot, TransportState } from './types';
import type { SharedWsTransport } from './shared-ws';

describe('SharedWsTransport Static Compliance', () => {
	test('should expose new state surfaces', () => {
		const client = {} as SharedWsTransport;
		assertType<Role>(client.role);
		assertType<TransportState>(client.transportState);
		assertType<StatusSnapshot>(client.status());
	});
});
