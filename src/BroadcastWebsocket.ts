import { Bus } from './bus';
import { Election } from './election';
import type { Options, StatusSnapshot } from './types';
import { randomId } from './utils';

type ReadyState = 0 | 1 | 2 | 3; // CONNECTING, OPEN, CLOSING, CLOSED

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

	binaryType: 'blob' | 'arraybuffer' = 'blob';
	protocol = '';
	extensions = '';

	onopen: WebSocket['onopen'] = null;
	onmessage: WebSocket['onmessage'] = null;
	onerror: WebSocket['onerror'] = null;
	onclose: WebSocket['onclose'] = null;

	private id = randomId(8);
	private ready: ReadyState = this.CONNECTING;
	private ws?: WebSocket;
	private opts: Options;
	private election: Election;
	private leaderId?: string;
	private bus?: Bus;
	private unsubBus?: () => void;

	constructor(url: string, options: Options = {}) {
		super();
		this.url = url;
		this.opts = options;
		this.scope =
			options.scope ??
			(() => {
				try {
					return new URL(url, typeof location !== 'undefined' ? location.href : 'http://localhost').origin;
				} catch {
					return 'default';
				}
			})();
		console.log(`[BWS] id=${this.id} url=${url} scope=${this.scope}`);

		this.opts = options;

		this.election = new Election(this.scope, {
			id: this.id,
			heartbeatMs: options.heartbeatMs,
			timeoutMs: options.timeoutMs,
		});
		// Setup broadcast channel for message forwarding
		try {
			this.bus = new Bus(`bws:bus:${this.scope}`);
			this.unsubBus = this.bus.on((msg) => this.onBus(msg));
		} catch (e) {}
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
		if (this.bus) {
			this.bus.close();
			this.bus = undefined;
		}
	}

	// Internals
	private openSocket() {
		this.transition(this.CONNECTING);
		try {
			const ws = new WebSocket(this.url);
			ws.binaryType = this.binaryType;
			this.ws = ws;
			ws.onopen = () => {
				this.protocol = ws.protocol;
				// biome-ignore lint/suspicious/noExplicitAny: extensions prop
				this.extensions = (ws as any).extensions || '';
				this.transition(this.OPEN);
				const ev = new Event('open');
				this.dispatchEvent(ev);
				this.onopen?.call(this, ev);
				this.bus?.post({ kind: 'sys', type: 'open' });
			};
			ws.onmessage = (ev) => {
				const newMessage = new MessageEvent('message', {
					// biome-ignore lint/suspicious/noExplicitAny: event props
					data: (ev as any).data,
					// biome-ignore lint/suspicious/noExplicitAny: event props
					lastEventId: (ev as any).lastEventId,
					// biome-ignore lint/suspicious/noExplicitAny: event props
					origin: (ev as any).origin,
					// biome-ignore lint/suspicious/noExplicitAny: event props
					ports: (ev as any).ports,
					// biome-ignore lint/suspicious/noExplicitAny: event props
					source: (ev as any).source,
				});
				this.dispatchEvent(newMessage);
				this.onmessage?.call(this, newMessage);
				this.bus?.post({ kind: 'in', payload: (ev as any).data });
			};
			ws.onerror = (ev) => {
				const newError = new Event('error');
				this.dispatchEvent(newError);
				this.onerror?.call(this, newError);
			};
			ws.onclose = (ev) => {
				this.transition(this.CLOSED);
				const newClose = new CloseEvent('close', {
					code: ev.code,
					reason: ev.reason,
					wasClean: ev.wasClean,
				});
				this.dispatchEvent(newClose);
				this.onclose?.call(this, newClose);
				this.bus?.post({ kind: 'sys', type: 'close' });
			};
		} catch (err) {
			const ev = new Event('error');
			this.dispatchEvent(ev);
			this.onerror?.call(this, ev);
		}
	}

	private transition(state: ReadyState) {
		this.ready = state;
	}

	private onBus(msg: any) {
		const m = msg as { kind: 'out' | 'in' | 'sys'; payload?: any; type?: 'open' | 'close' | 'error' };
		if (!m || !m.kind) return;
		if (m.kind === 'out') {
			if (!this.election.isLeader || !this.ws || this.ready !== this.OPEN) return;
			try {
				this.ws.send(m.payload as any);
			} catch {}
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
