import type { BusPayload, TransportCloseDetail, TransportState } from './types';

export const BUS_PROTOCOL_VERSION = 1 as const;

export type BusMessage =
	| { v: 1; kind: 'JOIN'; senderId: string }
	| { v: 1; kind: 'LEAVE'; senderId: string }
	| {
			v: 1;
			kind: 'STATE';
			senderId: string;
			transportState: TransportState;
			protocol?: string;
			extensions?: string;
			close?: TransportCloseDetail;
	  }
	| { v: 1; kind: 'IN'; senderId: string; data: BusPayload }
	| { v: 1; kind: 'OUT'; senderId: string; data: BusPayload; reqId?: string }
	| { v: 1; kind: 'TERMINATE'; senderId: string; code?: number; reason?: string; reqId?: string }
	| { v: 1; kind: 'ERROR'; senderId: string; message?: string };

const VALID_KINDS: ReadonlySet<BusMessage['kind']> = new Set([
	'JOIN',
	'LEAVE',
	'STATE',
	'IN',
	'OUT',
	'TERMINATE',
	'ERROR',
]);

export function isBusMessage(value: unknown): value is BusMessage {
	if (!value || typeof value !== 'object') return false;
	const msg = value as { v?: number; kind?: string; senderId?: string };
	if (msg.v !== BUS_PROTOCOL_VERSION) return false;
	if (!msg.kind || !VALID_KINDS.has(msg.kind as BusMessage['kind'])) return false;
	return typeof msg.senderId === 'string' && msg.senderId.length > 0;
}
