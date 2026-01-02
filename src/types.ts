export interface Options {
	scope: string;
	protocols?: string | string[];
	heartbeatMs?: number;
	timeoutMs?: number;
}

export interface StatusSnapshot {
	id: string;
	url: string;
	isLeader: boolean;
	leaderId?: string;
	readyState: 0 | 1 | 2 | 3;
	bufferedAmount: number;
}
// Event typing kept minimal to avoid coupling demos to custom types.
