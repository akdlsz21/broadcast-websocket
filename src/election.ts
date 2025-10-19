import { Emitter, randomId, now } from './utils';

export interface ElectionEvents {
  leader: { id: string };
  follower: { leaderId?: string };
  change: { leaderId?: string };
}

type Unsub = () => void;

export class SimpleElection {
  readonly scope: string;
  readonly id: string = randomId(8);
  readonly key: string;
  private heartbeatMs: number;
  private timeoutMs: number;
  private timer?: any;
  private emitter = new Emitter<ElectionEvents>();
  private _leaderId?: string;
  private storageHandler?: (e: StorageEvent) => void;

  constructor(scope: string, opts?: { heartbeatMs?: number; timeoutMs?: number }) {
    this.scope = scope;
    this.key = `bws:leader:${scope}`;
    this.heartbeatMs = opts?.heartbeatMs ?? 3000;
    this.timeoutMs = opts?.timeoutMs ?? 9000;
  }

  on = this.emitter.on.bind(this.emitter);

  get leaderId(): string | undefined { return this._leaderId; }
  get isLeader(): boolean { return this._leaderId === this.id; }

  start() {
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
    window.addEventListener('beforeunload', () => {
      if (this.isLeader) {
        try { localStorage.removeItem(this.key); } catch {}
      }
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.storageHandler) window.removeEventListener('storage', this.storageHandler);
  }

  private readLeader() {
    let val: string | null = null;
    try { val = localStorage.getItem(this.key); } catch {}
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
      this.emitter.emit('change', { leaderId: this._leaderId });
      if (this.isLeader) this.emitter.emit('leader', { id: this.id });
      else this.emitter.emit('follower', { leaderId: this._leaderId });
    }
  }

  private tryClaimIfExpired() {
    let stale = true;
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
