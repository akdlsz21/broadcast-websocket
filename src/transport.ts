import type { BusPayload, OutboundData, TransportCloseDetail, TransportState } from './types';

interface TransportHandlers {
	onStateChange: (state: TransportState) => void;
	onOpen: (info: { protocol: string; extensions: string }) => void;
	onMessage: (data: BusPayload) => void;
	onError: (error?: unknown) => void;
	onClose: (detail: TransportCloseDetail) => void;
}

interface TransportOptions {
	url: string;
	protocols?: string | string[];
	handlers: TransportHandlers;
}

export class Transport {
	private ws?: WebSocket;
	private state: TransportState = 'closed';
	private handlers: TransportHandlers;

	constructor(options: TransportOptions) {
		this.handlers = options.handlers;
		this.transition('connecting');
		try {
			this.ws = options.protocols ? new WebSocket(options.url, options.protocols) : new WebSocket(options.url);
		} catch (error) {
			this.transition('closed');
			this.handlers.onError(error);
			this.handlers.onClose({ code: 1006, reason: 'Failed to open transport', wasClean: false });
			return;
		}

		this.ws.binaryType = 'arraybuffer';

		this.ws.onopen = () => {
			if (!this.ws) return;
			this.handlers.onOpen({ protocol: this.ws.protocol, extensions: this.ws.extensions });
			this.transition('open');
		};

		this.ws.onmessage = (ev) => {
			const payload = ev.data;
			if (typeof payload === 'string' || payload instanceof ArrayBuffer) {
				this.handlers.onMessage(payload);
				return;
			}
			if (ArrayBuffer.isView(payload)) {
				const view = payload as ArrayBufferView;
				const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
				this.handlers.onMessage(buffer);
				return;
			}
			if (payload instanceof Blob) {
				void payload.arrayBuffer().then((buffer) => this.handlers.onMessage(buffer));
			}
		};

		this.ws.onerror = (ev) => {
			this.handlers.onError(ev);
		};

		this.ws.onclose = (ev) => {
			this.transition('closed');
			this.handlers.onClose({
				code: ev.code,
				reason: ev.reason,
				wasClean: ev.wasClean,
			});
		};
	}

	get transportState(): TransportState {
		return this.state;
	}

	send(data: OutboundData) {
		if (!this.ws || this.state !== 'open') throw new Error('Transport not open');
		this.ws.send(data as any);
	}

	close(code?: number, reason?: string) {
		if (!this.ws || this.state === 'closing' || this.state === 'closed') return;
		this.transition('closing');
		this.ws.close(code, reason);
	}

	dispose() {
		if (!this.ws) return;
		this.ws.close();
	}

	private transition(next: TransportState) {
		if (this.state === next) return;
		this.state = next;
		this.handlers.onStateChange(next);
	}
}
