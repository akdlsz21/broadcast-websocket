import BroadcastWebsocket from './BroadcastWebsocket';

export type Unsubscribe = () => void;

export type EventMap = Record<string, any>;

export class Emitter<Events extends EventMap> {
  private listeners: { [K in keyof Events]?: Array<(payload: Events[K]) => void> } = {};

  private BWS: BroadcastWebsocket | null = null;
  
  constructor(bws?: BroadcastWebsocket) {
    if (bws) this.BWS = bws;
  }


  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): Unsubscribe {
    const arr = (this.listeners[event] ??= []);
    arr.push(handler as any);
    return () => this.off(event, handler);
  }

  off<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void) {
    const arr = this.listeners[event];
    if (!arr) return;
    const idx = arr.indexOf(handler as any);
    if (idx >= 0) arr.splice(idx, 1);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]) {
    const arr = this.listeners[event];
    if(this.BWS?.onerror && event === 'error') {
     arr?.push(this.BWS.onerror as any);
    }
    if(this.BWS?.onopen && event === 'open') {
     arr?.push(this.BWS.onopen as any);
    }
    if(this.BWS?.onclose && event === 'close') {
     arr?.push(this.BWS.onclose as any);
    }
    if(this.BWS?.onmessage && event === 'message') {
     arr?.push(this.BWS.onmessage as any);
    } 


    if (!arr) return;
    // copy to avoid mutation during emit
    [...arr].forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[BroadcastWebsocket:listener-error]', err);
      }
    });

  }
}

export function randomId(len = 16): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function now(): number {
  return Date.now();
}

// backoff/sleep removed for MVP (no reconnect)

export function safeJsonStringify(v: any): string {
  try {
    return JSON.stringify(v);
  } catch {
    return 'null';
  }
}

// MVP: size helpers not needed
