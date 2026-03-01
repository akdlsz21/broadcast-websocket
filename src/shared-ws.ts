import { Bus } from './bus';
import { Election } from './election';
import { BUS_PROTOCOL_VERSION, type BusMessage, isBusMessage } from './protocol';
import { Transport } from './transport';
import type {
	BusPayload,
	Options,
	OutboundData,
	Role,
	SharedWsEventMap,
	StatusSnapshot,
	TransportCloseDetail,
	TransportState,
} from './types';
import { randomId, safeJsonStringify } from './utils';

const DEFAULT_HEARTBEAT_MS = 2000;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_OPTIONS = {
	heartbeatMs: DEFAULT_HEARTBEAT_MS,
	timeoutMs: DEFAULT_TIMEOUT_MS,
	debug: false,
} satisfies Required<Pick<Options, 'heartbeatMs' | 'timeoutMs' | 'debug'>>;

const DEFAULT_CLOSE: TransportCloseDetail = {
	code: 1000,
	reason: '',
	wasClean: true,
};

const BUS_PREFIX = 'shared-ws:bus:';

/**
 * One physical WebSocket per {url, scope}. Leader tab owns transport.
 * Other tabs attach and delegate send; all tabs receive messages.
 */
export class SharedWsTransport extends EventTarget {
	readonly url: string;
	readonly scope: string;

	private readonly id = randomId(8);
	private readonly options: Options;
	private _role: Role = 'follower';
	private leaderId?: string;
	private _transportState: TransportState = 'connecting';
	private protocol = '';
	private extensions = '';
	private bus: Bus<BusMessage>;
	private unsubBus?: () => void;
	private election: Election;
	private transport?: Transport;
	private detached = false;
	private followerIds = new Set<string>();

	constructor(url: string, options: Partial<Options> = {}) {
		super();
		this.options = { ...DEFAULT_OPTIONS, ...options };
		this.url = url;
		this.scope = this.options.scope ?? deriveScope(url);
		this.bus = new Bus<BusMessage>(`${BUS_PREFIX}${this.scope}`);
		this.unsubBus = this.bus.on((msg) => this.onBusMessage(msg));

		this.election = new Election(this.scope, {
			id: this.id,
			heartbeatMs: this.options.heartbeatMs,
			timeoutMs: this.options.timeoutMs,
			keyPrefix: 'shared-ws:leader:',
		});
		this.election.addEventListener('leader', () => this.becomeLeader());
		this.election.addEventListener('follower', (event) => {
			const detail = (event as CustomEvent<{ leaderId?: string }>).detail;
			this.becomeFollower(detail?.leaderId);
		});
		this.election.start();
		this.postJoin();
	}

	get transportState(): TransportState {
		return this._transportState;
	}

	get role(): Role {
		return this._role;
	}

	send(data: OutboundData) {
		if (this._transportState !== 'open') throw new Error('Transport not open');
		if (this._role === 'leader') {
			if (!this.transport) throw new Error('Transport not open');
			this.transport.send(data);
			return;
		}
		const payload = toBusPayload(data);
		if (payload instanceof Promise) {
			void payload
				.then((resolved) => this.postOut(resolved))
				.catch((error) => this.log('send:convert_failed', { error: formatError(error) }));
			return;
		}
		this.postOut(payload);
	}

	terminate(code?: number, reason?: string) {
		if (this._role === 'leader') {
			this.transport?.close(code, reason);
			return;
		}
		this.postBus({
			v: BUS_PROTOCOL_VERSION,
			kind: 'TERMINATE',
			senderId: this.id,
			code,
			reason,
		});
	}

	detach() {
		if (this.detached) return;
		this.postBus({
			v: BUS_PROTOCOL_VERSION,
			kind: 'LEAVE',
			senderId: this.id,
		});

		if (this._role === 'leader' && this.transport) {
			const closeDetail = { ...DEFAULT_CLOSE, reason: 'Leader detached' };
			this.applyTransportState('closed', closeDetail);
			this.broadcastState(closeDetail);
			this.detached = true;
			this.transport.dispose();
		} else {
			this.detached = true;
		}

		this.election.stop();
		if (this.unsubBus) this.unsubBus();
		this.bus.close();
	}

	dispose() {
		this.detach();
	}

	status(): StatusSnapshot {
		return {
			id: this.id,
			role: this._role,
			leaderId: this.leaderId,
			transportState: this._transportState,
			url: this.url,
			scope: this.scope,
		};
	}

	override addEventListener<K extends keyof SharedWsEventMap>(
		type: K,
		listener: ((this: SharedWsTransport, ev: CustomEvent<SharedWsEventMap[K]>) => void) | null,
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

	private postJoin() {
		this.postBus({
			v: BUS_PROTOCOL_VERSION,
			kind: 'JOIN',
			senderId: this.id,
		});
	}

	private postOut(payload: BusPayload) {
		this.postBus({
			v: BUS_PROTOCOL_VERSION,
			kind: 'OUT',
			senderId: this.id,
			data: payload,
		});
	}

	private postBus(message: BusMessage) {
		if (this.detached) return;
		this.bus.post(message);
	}

	private becomeLeader() {
		this.setRole('leader', this.id);
		this.startTransport();
	}

	private becomeFollower(leaderId?: string) {
		this.stopTransport();
		this.protocol = '';
		this.extensions = '';
		this.setRole('follower', leaderId);
		this._transportState = 'connecting';
		this.postJoin();
	}

	private setRole(role: Role, leaderId?: string) {
		const changed = this._role !== role || this.leaderId !== leaderId;
		this._role = role;
		this.leaderId = leaderId;
		if (changed) {
			this.emit('role_change', { role, leaderId });
			this.log('role_change', { role, leaderId });
		}
	}

	private startTransport() {
		this.stopTransport();
		this.protocol = '';
		this.extensions = '';
		this.transport = new Transport({
			url: this.url,
			protocols: this.options.protocols,
			handlers: {
				onStateChange: (state) => {
					if (state === 'open') {
						this.applyTransportState('open');
						this.broadcastState();
						return;
					}
					if (state === 'closed') return;
					this._transportState = state;
					if (state === 'connecting' || state === 'closing') {
						this.broadcastState();
					}
				},
				onOpen: ({ protocol, extensions }) => {
					this.protocol = protocol;
					this.extensions = extensions;
				},
				onMessage: (data) => {
					this.emit('message', { data });
					this.postBus({
						v: BUS_PROTOCOL_VERSION,
						kind: 'IN',
						senderId: this.id,
						data,
					});
				},
				onError: (error) => {
					this.emit('transport_error', { error });
					this.postBus({
						v: BUS_PROTOCOL_VERSION,
						kind: 'ERROR',
						senderId: this.id,
						message: formatError(error),
					});
				},
				onClose: (detail) => {
					this.applyTransportState('closed', detail);
					this.broadcastState(detail);
				},
			},
		});
	}

	private stopTransport() {
		if (!this.transport) return;
		this.transport.dispose();
		this.transport = undefined;
	}

	private onBusMessage(message: unknown) {
		if (this.detached || !isBusMessage(message)) return;
		if (message.senderId === this.id) return;

		switch (message.kind) {
			case 'JOIN':
				if (!this.isLeader()) return;
				this.followerIds.add(message.senderId);
				this.log('join', { followers: this.followerIds.size });
				this.broadcastState();
				return;
			case 'LEAVE':
				if (!this.isLeader()) return;
				this.followerIds.delete(message.senderId);
				this.log('leave', { followers: this.followerIds.size });
				return;
			case 'OUT':
				if (!this.isLeader()) return;
				if (this._transportState !== 'open' || !this.transport) return;
				try {
					this.transport.send(message.data);
				} catch (error) {
					this.log('send:leader_failed', { error: formatError(error) });
				}
				return;
			case 'TERMINATE':
				if (!this.isLeader()) return;
				this.log('terminate', { senderId: message.senderId });
				this.transport?.close(message.code, message.reason);
				return;
			case 'STATE':
				if (this.isLeader()) return;
				this.applyLeaderState(message);
				return;
			case 'IN':
				if (this.isLeader()) return;
				if (!this.isFromLeader(message.senderId)) return;
				this.emit('message', { data: message.data });
				return;
			case 'ERROR':
				if (this.isLeader()) return;
				if (!this.isFromLeader(message.senderId)) return;
				this.emit('transport_error', { error: message.message });
				return;
		}
	}

	private applyLeaderState(message: Extract<BusMessage, { kind: 'STATE' }>) {
		if (!this.isFromLeader(message.senderId)) return;
		const previous = this._transportState;
		this.protocol = message.protocol ?? this.protocol;
		this.extensions = message.extensions ?? this.extensions;
		this._transportState = message.transportState;

		if (message.transportState === 'open' && previous !== 'open') {
			this.emit('transport_open', { protocol: this.protocol, extensions: this.extensions });
		}

		if (message.transportState === 'closed' && previous !== 'closed') {
			const detail = message.close ?? DEFAULT_CLOSE;
			this.emit('transport_close', detail);
		}
	}

	private broadcastState(closeDetail?: TransportCloseDetail) {
		if (!this.isLeader()) return;
		const message: BusMessage = {
			v: BUS_PROTOCOL_VERSION,
			kind: 'STATE',
			senderId: this.id,
			transportState: this._transportState,
		};
		if (this._transportState === 'open') {
			message.protocol = this.protocol;
			message.extensions = this.extensions;
		}
		if (closeDetail) message.close = closeDetail;
		this.postBus(message);
	}

	private applyTransportState(state: TransportState, detail?: TransportCloseDetail) {
		const previous = this._transportState;
		this._transportState = state;

		if (state === 'open' && previous !== 'open') {
			this.emit('transport_open', { protocol: this.protocol, extensions: this.extensions });
			this.log('transport_open', { protocol: this.protocol, extensions: this.extensions });
			return;
		}

		if (state === 'closed' && previous !== 'closed') {
			const closeDetail = detail ?? DEFAULT_CLOSE;
			this.emit('transport_close', closeDetail);
			this.log('transport_close', {
				code: closeDetail.code,
				reason: closeDetail.reason,
				wasClean: closeDetail.wasClean,
			});
		}
	}

	private isLeader() {
		return this._role === 'leader';
	}

	private isFromLeader(senderId: string) {
		if (!this.leaderId) return true;
		return this.leaderId === senderId;
	}

	private emit<K extends keyof SharedWsEventMap>(type: K, detail: SharedWsEventMap[K]) {
		this.dispatchEvent(new CustomEvent(type, { detail }));
	}

	private log(message: string, detail?: Record<string, unknown>) {
		if (!this.options.debug) return;
		if (this.options.logger) {
			this.options.logger(message, detail);
			return;
		}
		if (detail) {
			console.log(`[SharedWsTransport] ${message}`, detail);
		} else {
			console.log(`[SharedWsTransport] ${message}`);
		}
	}
}

function deriveScope(url: string) {
	try {
		return new URL(url).origin;
	} catch {
		return url;
	}
}

function formatError(error: unknown) {
	if (typeof error === 'string') return error;
	if (error instanceof Error) return error.message;
	return safeJsonStringify(error);
}

function toBusPayload(data: OutboundData): BusPayload | Promise<BusPayload> {
	if (typeof data === 'string') return data;
	if (data instanceof ArrayBuffer) return data;
	if (ArrayBuffer.isView(data)) {
		const view = data as ArrayBufferView;
		return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
	}
	if (typeof Blob !== 'undefined' && data instanceof Blob) {
		return data.arrayBuffer();
	}
	throw new Error('Unsupported data type');
}
