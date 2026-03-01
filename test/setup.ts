import { WebSocket } from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
	globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}

if (typeof globalThis.BroadcastChannel === 'undefined') {
	type MessageHandler = (event: MessageEvent) => void;

	const createMessageEvent = (data: unknown) => {
		if (typeof MessageEvent !== 'undefined') {
			return new MessageEvent('message', { data });
		}
		return { data } as MessageEvent;
	};

	class BroadcastChannelPolyfill {
		static channels = new Map<string, Set<BroadcastChannelPolyfill>>();
		private listeners = new Set<MessageHandler>();
		readonly name: string;

		constructor(name: string) {
			this.name = name;
			const existing = BroadcastChannelPolyfill.channels.get(name) ?? new Set();
			existing.add(this);
			BroadcastChannelPolyfill.channels.set(name, existing);
		}

		postMessage(data: unknown) {
			const channels = BroadcastChannelPolyfill.channels.get(this.name);
			if (!channels) return;
			for (const channel of channels) {
				const event = createMessageEvent(data);
				channel.listeners.forEach((listener) => listener(event));
			}
		}

		addEventListener(type: string, listener: MessageHandler) {
			if (type !== 'message') return;
			this.listeners.add(listener);
		}

		removeEventListener(type: string, listener: MessageHandler) {
			if (type !== 'message') return;
			this.listeners.delete(listener);
		}

		close() {
			const channels = BroadcastChannelPolyfill.channels.get(this.name);
			if (!channels) return;
			channels.delete(this);
			if (channels.size === 0) BroadcastChannelPolyfill.channels.delete(this.name);
		}
	}

	globalThis.BroadcastChannel = BroadcastChannelPolyfill as unknown as typeof globalThis.BroadcastChannel;
}
