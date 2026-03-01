import { now, randomId } from './utils';

export interface ElectionEvents {
	leader: { id: string };
	follower: { leaderId?: string };
	change: { leaderId?: string };
}

interface ElectionOptions {
	id?: string;
	heartbeatMs?: number;
	timeoutMs?: number;
	keyPrefix?: string;
}

export class Election extends EventTarget {
	readonly scope: string;
	readonly id: string;
	readonly key: string;
	private heartbeatMs: number;
	private timeoutMs: number;
	// biome-ignore lint/suspicious/noExplicitAny: timer
	private timer?: any;
	private _leaderId?: string;
	private storageHandler?: (e: StorageEvent) => void;
	private beforeUnloadHandler?: () => void;

	constructor(scope: string, opts?: ElectionOptions) {
		super();
		this.scope = scope;
		this.id = opts?.id ?? randomId(8);
		const prefix = opts?.keyPrefix ?? 'shared-ws:leader:';
		this.key = `${prefix}${scope}`;
		this.heartbeatMs = opts?.heartbeatMs ?? 3000;
		this.timeoutMs = opts?.timeoutMs ?? 9000;
	}

	get leaderId(): string | undefined {
		return this._leaderId;
	}
	get isLeader(): boolean {
		return this._leaderId === this.id;
	}

	start() {
		if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
			throw new Error('Election requires window.localStorage');
		}
		// observe other tabs
		this.storageHandler = (e: StorageEvent) => {
			if (e.key !== this.key) return;
			this.readLeader();
		};
		window.addEventListener('storage', this.storageHandler);

		// attempt to claim if needed
		this.readLeader();
		this.tryClaimIfExpired();

		// setup upkeep
		this.timer = setInterval(() => {
			if (this.isLeader) this.heartbeat();
			else this.tryClaimIfExpired();
		}, this.heartbeatMs);

		// best effort: release on unload
		this.beforeUnloadHandler = () => {
			if (this.isLeader) {
				try {
					localStorage.removeItem(this.key);
				} catch {}
			}
		};
		window.addEventListener('beforeunload', this.beforeUnloadHandler);
	}

	stop() {
		if (this.timer) clearInterval(this.timer);
		if (this.storageHandler) window.removeEventListener('storage', this.storageHandler);
		if (this.beforeUnloadHandler) window.removeEventListener('beforeunload', this.beforeUnloadHandler);
		if (this.isLeader) {
			try {
				localStorage.removeItem(this.key);
			} catch {}
		}
	}

	private readLeader() {
		let val: string | null = null;
		try {
			val = localStorage.getItem(this.key);
		} catch {}
		let nextId: string | undefined;
		if (val) {
			try {
				const obj = JSON.parse(val);
				if (obj && typeof obj.id === 'string' && typeof obj.ts === 'number') {
					// expire if stale
					if (now() - obj.ts <= this.timeoutMs) nextId = obj.id;
				}
			} catch {}
		}
		const changed = nextId !== this._leaderId;
		this._leaderId = nextId;
		if (changed) {
			this.dispatchEvent(new CustomEvent('change', { detail: { leaderId: this._leaderId } }));
			if (this.isLeader) this.dispatchEvent(new CustomEvent('leader', { detail: { id: this.id } }));
			else this.dispatchEvent(new CustomEvent('follower', { detail: { leaderId: this._leaderId } }));
		}
	}

	private tryClaimIfExpired() {
		let stale = true;
		// biome-ignore lint/suspicious/noExplicitAny: storage value
		let current: any;
		try {
			const val = localStorage.getItem(this.key);
			if (val) {
				current = JSON.parse(val);
				if (current && typeof current.ts === 'number') {
					stale = now() - current.ts > this.timeoutMs;
				}
			}
		} catch {}
		if (this._leaderId && !stale) return;
		// try claim
		try {
			const claim = { id: this.id, ts: now() };
			localStorage.setItem(this.key, JSON.stringify(claim));
		} catch {}
		// re-read to verify
		this.readLeader();
	}

	private heartbeat() {
		try {
			const val = { id: this.id, ts: now() };
			localStorage.setItem(this.key, JSON.stringify(val));
		} catch {}
	}
}
