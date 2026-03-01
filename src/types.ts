export type TransportState = 'connecting' | 'open' | 'closing' | 'closed';
export type Role = 'leader' | 'follower';

export type BusPayload = string | ArrayBuffer;
export type OutboundData = string | ArrayBuffer | ArrayBufferView | Blob;

export type Logger = (message: string, detail?: Record<string, unknown>) => void;

export interface Options {
	scope?: string;
	protocols?: string | string[];
	heartbeatMs?: number;
	timeoutMs?: number;
	debug?: boolean;
	logger?: Logger;
}

export interface StatusSnapshot {
	id: string;
	role: Role;
	leaderId?: string;
	transportState: TransportState;
	url: string;
	scope: string;
}

export interface TransportOpenDetail {
	protocol: string;
	extensions: string;
}

export interface TransportCloseDetail {
	code: number;
	reason: string;
	wasClean: boolean;
}

export interface TransportErrorDetail {
	error?: unknown;
}

export interface MessageDetail {
	data: BusPayload;
}

export interface RoleChangeDetail {
	role: Role;
	leaderId?: string;
}

export interface SharedWsEventMap {
	transport_open: TransportOpenDetail;
	transport_close: TransportCloseDetail;
	transport_error: TransportErrorDetail;
	message: MessageDetail;
	role_change: RoleChangeDetail;
}
