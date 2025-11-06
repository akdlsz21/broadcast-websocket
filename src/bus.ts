export type BusMessage = { kind: 'out' | 'in' | 'sys'; payload?: any; type?: 'open' | 'close' | 'error' };

export class Bus {
	private ch: BroadcastChannel;
	constructor(name: string) {
		if (typeof BroadcastChannel === 'undefined') {
			throw new Error('BroadcastChannel not supported in this environment');
		}
		this.ch = new BroadcastChannel(name);
	}
	post(msg: BusMessage) {
		this.ch.postMessage(msg);
	}
	on(handler: (msg: BusMessage) => void): () => void {
		const cb = (ev: MessageEvent) => handler(ev.data as BusMessage);
		this.ch.addEventListener('message', cb);
		return () => this.ch.removeEventListener('message', cb);
	}
	close() {
		this.ch.close();
	}
}
