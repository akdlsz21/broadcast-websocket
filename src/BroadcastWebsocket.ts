import { Emitter, randomId } from './utils';
import type { Options, StatusSnapshot } from './types';
import { SimpleElection } from './election';
import { Bus } from './bus';

type ReadyState = 0 | 1 | 2 | 3; // CONNECTING, OPEN, CLOSING, CLOSED


export class BroadcastWebsocket implements WebSocket {
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readonly url: string;
  readonly protocols?: string | string[];
  readonly scope: string;

  binaryType: 'blob' | 'arraybuffer' = 'blob';
  protocol = '';
  extensions = '';

  onopen: WebSocket['onopen'] = null;
  onmessage: WebSocket['onmessage'] = null;
  onerror: WebSocket['onerror'] = null;
  onclose: WebSocket['onclose'] = null;

  private emitter = new Emitter<{ open: Event; message: MessageEvent; error: Event; close: CloseEvent }>();
  private id = randomId(8);
  private ready: ReadyState = this.CONNECTING; 
  private ws?: WebSocket;
  private opts: { protocols?: string | string[] };
  private election: SimpleElection;
  private leaderId?: string;
  private bus?: Bus;
  private unsubBus?: () => void;

  constructor(url: string, options: Options = {}) {
    this.url = url;
    this.protocols = options.protocols;
    this.scope = options.scope ?? (() => {
      try { return new URL(url, typeof location !== 'undefined' ? location.href : 'http://localhost').origin; } catch { return 'default'; }
    })();

    this.opts = { protocols: options.protocols };
    // start simple leader election
    this.election = new SimpleElection(this.scope);
    // Setup broadcast channel for message forwarding
    try {
      this.bus = new Bus(`bws:bus:${this.scope}`);
      this.unsubBus = this.bus.on((msg) => this.onBus(msg));
    } catch (e) {}
    this.election.on('leader', () => {
      this.leaderId = this.id;
      this.openSocket();
    });
    this.election.on('follower', (e) => {
      this.leaderId = e.leaderId;
      // ensure we are not holding a socket
      if (this.ws) {
        try { this.ws.close(); } catch {}
        this.ws = undefined;
        this.transition(this.CONNECTING);
      }
    });
    this.election.start();
  }

  // EventTarget-like API
  addEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any,
    _options?: boolean | AddEventListenerOptions
  ): void {
    this.emitter.on(type as any, listener as any);
  }
  removeEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any,
    _options?: boolean | EventListenerOptions
  ): void {
    this.emitter.off(type as any, listener as any);
  }
  dispatchEvent(event: Event): boolean {
    this.emitter.emit(event.type as any, event as any);
    return true;
  }

  get readyState(): ReadyState { return this.ready; }
  get bufferedAmount(): number { return this.ws?.bufferedAmount ?? 0; }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (this.election.isLeader) {
      if (this.ready !== this.OPEN || !this.ws) throw new Error('WebSocket not open');
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
      this.emitter.emit('close', ev);
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
    if (this.bus) this.bus.close();
  }

  // Internals
  private openSocket() {
    this.transition(this.CONNECTING);
    try {
      const ws = new WebSocket(this.url, this.protocols);
      ws.binaryType = this.binaryType;
      this.ws = ws;
      ws.onopen = () => {
        this.protocol = ws.protocol;
        this.extensions = (ws as any).extensions || '';
        this.transition(this.OPEN);
        const ev = new Event('open');
        this.emitter.emit('open', ev);
        this.onopen?.call(this, ev);
        this.bus?.post({ kind: 'sys', type: 'open' });
      };
      ws.onmessage = (ev) => {
        this.emitter.emit('message', ev as any);
        this.onmessage?.call(this, ev as any);
        this.bus?.post({ kind: 'in', payload: (ev as any).data });
      };
      ws.onerror = (ev) => {
        this.emitter.emit('error', ev as any);
        this.onerror?.call(this, ev as any);
      };
      ws.onclose = (ev) => {
        this.transition(this.CLOSED);
        this.emitter.emit('close', ev as any);
        this.onclose?.call(this, ev as any);
        this.bus?.post({ kind: 'sys', type: 'close' });
      };
    } catch (err) {
      const ev = new Event('error');
      this.emitter.emit('error', ev);
      this.onerror?.call(this, ev);
    }
  }

  private transition(state: ReadyState) { this.ready = state; }
  

  private onBus(msg: any) {
    const m = msg as { kind: 'out' | 'in' | 'sys'; payload?: any; type?: 'open' | 'close' | 'error' };
    if (!m || !m.kind) return;
    if (m.kind === 'out') {
      if (!this.election.isLeader || !this.ws || this.ready !== this.OPEN) return;
      try { this.ws.send(m.payload as any); } catch {}
      return;
    }
    if (m.kind === 'in') {
      if (this.election.isLeader) return;
      const ev = new MessageEvent('message', { data: m.payload });
      this.emitter.emit('message', ev);
      this.onmessage?.call(this, ev);
      return;
    }
    if (m.kind === 'sys') {
      if (this.election.isLeader) return;
      if (m.type === 'open' && this.ready !== this.OPEN) {
        this.transition(this.OPEN);
        const ev = new Event('open');
        this.emitter.emit('open', ev);
        this.onopen?.call(this, ev);
      } else if (m.type === 'close' && this.ready !== this.CLOSED) {
        this.transition(this.CLOSED);
        const ev = new CloseEvent('close');
        this.emitter.emit('close', ev);
        this.onclose?.call(this, ev);
      }
    }
  }
}
