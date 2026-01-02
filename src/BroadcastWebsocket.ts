import { Bus } from './bus';
import { Election } from './election';
import type { Options, StatusSnapshot } from './types';
import { randomId } from './utils';

type ReadyState = 0 | 1 | 2 | 3; // CONNECTING, OPEN, CLOSING, CLOSED

// implement default options constructor parameters
const DEFAULT_HEARTBEAT_MS = 2000;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_OPTIONS: Options = {
	scope: 'default',
	heartbeatMs: DEFAULT_HEARTBEAT_MS,
	timeoutMs: DEFAULT_TIMEOUT_MS,
};

interface WebSocketEventMap {
	close: CloseEvent;
	error: Event;
	message: MessageEvent;
	open: Event;
}

export class BroadcastWebsocket extends EventTarget implements WebSocket {
	static readonly CONNECTING = WebSocket.CONNECTING;
	static readonly OPEN = WebSocket.OPEN;
	static readonly CLOSING = WebSocket.CLOSING;
	static readonly CLOSED = WebSocket.CLOSED;

	readonly CONNECTING = WebSocket.CONNECTING;
	readonly OPEN = WebSocket.OPEN;
	readonly CLOSING = WebSocket.CLOSING;
	readonly CLOSED = WebSocket.CLOSED;

	readonly url: string;
	readonly scope: string;

	binaryType: WebSocket['binaryType'] = 'blob';
	protocol = '';
	extensions = '';

	onopen: WebSocket['onopen'] = null;
	onmessage: WebSocket['onmessage'] = null;
	onerror: WebSocket['onerror'] = null;
	onclose: WebSocket['onclose'] = null;

	private id = randomId(8);
	private ready: ReadyState = this.CLOSED;
	private ws?: WebSocket;
	private election: Election;
	private leaderId?: string;
	private bus: Bus;
	private unsubBus?: () => void;

	constructor(url: string, options: Options = DEFAULT_OPTIONS) {
		super();
		this.url = url;
		this.scope = options.scope;
		console.log(`[BWS] id=${this.id} url=${url} scope=${this.scope}`);

		this.election = new Election(this.scope, {
			id: this.id,
			heartbeatMs: options.heartbeatMs,
			timeoutMs: options.timeoutMs,
		});

		// Setup broadcast channel for message forwarding
		this.bus = new Bus(`bws:bus:${this.scope}`);
		this.unsubBus = this.bus.on((msg) => this.onBus(msg));
		this.election.addEventListener('leader', () => {
			this.leaderId = this.id;
			this.openSocket();
		});
		// biome-ignore lint/suspicious/noExplicitAny: event detail
		this.election.addEventListener('follower', (e: any) => {
			this.leaderId = e.detail.leaderId;
			// ensure we are not holding a socket
			if (this.ws) {
				try {
					this.ws.close();
				} catch {}
				this.ws = undefined;
				this.transition(this.CONNECTING);
			}
		});
		this.election.start();
	}

	get readyState(): ReadyState {
		return this.ready;
	}
	get bufferedAmount(): number {
		return this.ws?.bufferedAmount ?? 0;
	}

	send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
		if (this.election.isLeader) {
			if (this.ready !== this.OPEN || !this.ws) throw new Error('WebSocket not open');
			// biome-ignore lint/suspicious/noExplicitAny: websocket data
			this.ws.send(data as any);
			// Notify all tabs (including self) that a message was sent
			const payload = data;
			this.bus?.post({ kind: 'sent', payload });
			this.dispatchEvent(new CustomEvent('sent', { detail: payload }));
			return;
		}
		// delegate to leader via BroadcastChannel
		this.bus?.post({ kind: 'out', payload: data });
	}

	close(code?: number, reason?: string) {
		if (!this.election.isLeader) {
			// followers: local close semantics only
			this.transition(this.CLOSING);
			const ev = new CloseEvent('close', { code: code ?? 1000, reason: reason ?? '', wasClean: true });
			this.transition(this.CLOSED);
			this.dispatchEvent(ev);
			this.onclose?.call(this, ev);
			return;
		}
		this.transition(this.CLOSING);
		this.ws?.close(code, reason);
	}

	status(): StatusSnapshot {
		return {
			id: this.id,
			url: this.url,
			isLeader: this.election?.isLeader ?? false,
			leaderId: this.leaderId,
			readyState: this.ready,
			bufferedAmount: this.bufferedAmount,
		};
	}

	dispose() {
		this.ws?.close();
		this.transition(this.CLOSED);
		if (this.election) this.election.stop();
		if (this.unsubBus) this.unsubBus();
		this.bus.close();
	}

	override addEventListener<K extends keyof WebSocketEventMap>(
		type: K,
		listener: ((this: WebSocket, ev: WebSocketEventMap[K]) => any) | null,
		options?: AddEventListenerOptions | boolean
	): void;
	override addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: AddEventListenerOptions | boolean
	): void;
	override addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: AddEventListenerOptions | boolean
	): void {
		super.addEventListener(type, listener as EventListenerOrEventListenerObject, options);
	}

	// Internals
	private openSocket() {
		this.transition(this.CONNECTING);
		const ws = new WebSocket(this.url);
		ws.binaryType = this.binaryType;
		this.ws = ws;
		ws.onopen = (ev) => {
			console.log('[BWS] ws.onopen');
			this.protocol = ws.protocol;
			this.extensions = ws.extensions;
			this.transition(this.OPEN);
			this.dispatchEvent(ev);
			this.onopen?.call(this, ev);
			this.bus?.post({ kind: 'sys', type: 'open' });
		};
		ws.onmessage = (ev) => {
			this.dispatchEvent(ev);
			this.onmessage?.call(this, ev);
			this.bus?.post({ kind: 'in', payload: (ev as any).data });
		};
		ws.onerror = (ev) => {
			this.dispatchEvent(ev);
			this.onerror?.call(this, ev);
		};
		ws.onclose = (ev) => {
			this.transition(this.CLOSED);
			this.onclose?.call(this, ev);
			this.dispatchEvent(ev);
			this.bus?.post({ kind: 'sys', type: 'close' });
		};
	}

	private transition(state: ReadyState) {
		this.ready = state;
	}

	private onBus(msg: any) {
		// biome-ignore lint/suspicious/noExplicitAny: any
		const m = msg as { kind: 'out' | 'in' | 'sys' | 'sent'; payload?: any; type?: 'open' | 'close' | 'error' };
		if (!m || !m.kind) return;
		if (m.kind === 'out') {
			if (!this.election.isLeader || !this.ws || this.ready !== this.OPEN) return;
			try {
				this.ws.send(m.payload as any);
				// Notify all tabs that we sent this delegated message
				this.bus.post({ kind: 'sent', payload: m.payload });
				this.dispatchEvent(new CustomEvent('sent', { detail: m.payload }));
			} catch {}
			return;
		}
		if (m.kind === 'sent') {
			if (this.election.isLeader) return; // Leader already dispatched it locally
			this.dispatchEvent(new CustomEvent('sent', { detail: m.payload }));
			return;
		}
		if (m.kind === 'in') {
			if (this.election.isLeader) return;
			const ev = new MessageEvent('message', { data: m.payload });
			this.dispatchEvent(ev);
			this.onmessage?.call(this, ev);
			return;
		}
		if (m.kind === 'sys') {
			if (this.election.isLeader) return;
			if (m.type === 'open' && this.ready !== this.OPEN) {
				this.transition(this.OPEN);
				const ev = new Event('open');
				this.dispatchEvent(ev);
				this.onopen?.call(this, ev);
			} else if (m.type === 'close' && this.ready !== this.CLOSED) {
				this.transition(this.CLOSED);
				const ev = new CloseEvent('close');
				this.dispatchEvent(ev);
				this.onclose?.call(this, ev);
			}
		}
	}
}
