export class Bus<T> {
	private ch: BroadcastChannel;
	constructor(name: string) {
		if (typeof BroadcastChannel === 'undefined') {
			throw new Error('BroadcastChannel not supported in this environment');
		}
		this.ch = new BroadcastChannel(name);
	}
	post(msg: T) {
		this.ch.postMessage(msg);
	}
	on(handler: (msg: T) => void): () => void {
		const cb = (ev: MessageEvent) => handler(ev.data as T);
		this.ch.addEventListener('message', cb);
		return () => this.ch.removeEventListener('message', cb);
	}
	close() {
		this.ch.close();
	}
}
