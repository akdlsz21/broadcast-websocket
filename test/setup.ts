import { WebSocket } from 'ws';

// Polyfill for Node environment
// biome-ignore lint/suspicious/noExplicitAny: polyfill
global.WebSocket = WebSocket as any;

if (!global.BroadcastChannel) {
	// Simple in-memory BroadcastChannel polyfill for Node
	// biome-ignore lint/suspicious/noExplicitAny: polyfill
	const channels: Record<string, any[]> = {};
	global.BroadcastChannel = class BroadcastChannel {
		name: string;
		// biome-ignore lint/suspicious/noExplicitAny: polyfill
		onmessage: ((this: BroadcastChannel, ev: MessageEvent) => any) | null = null;
		constructor(name: string) {
			this.name = name;
			if (!channels[name]) channels[name] = [];
			channels[name].push(this);
		}
		// biome-ignore lint/suspicious/noExplicitAny: polyfill
		postMessage(data: any) {
			const listeners = channels[this.name] || [];
			listeners.forEach((l) => {
				if (l !== this && l.onmessage) {
					l.onmessage(new MessageEvent('message', { data }));
				}
			});
		}
		close() {
			const listeners = channels[this.name] || [];
			const idx = listeners.indexOf(this);
			if (idx > -1) listeners.splice(idx, 1);
		}
		addEventListener() {}
		removeEventListener() {}
		dispatchEvent() {
			return true;
		}
		// biome-ignore lint/suspicious/noExplicitAny: polyfill
	} as any;
}

if (!global.localStorage) {
	let store: Record<string, string> = {};
	global.localStorage = {
		getItem: (key: string) => store[key] || null,
		setItem: (key: string, value: string) => {
			store[key] = value;
			window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		},
		length: 0,
		key: () => null,
	};
}

if (!global.window) {
	// biome-ignore lint/suspicious/noExplicitAny: polyfill
	global.window = global as any;
	// biome-ignore lint/suspicious/noExplicitAny: polyfill
	global.window.addEventListener = (type: string, listener: any) => {
		if (type === 'storage') {
			// simple hook for our mock
			if (!global.window._storageListeners) global.window._storageListeners = [];
			global.window._storageListeners.push(listener);
		}
	};
	// biome-ignore lint/suspicious/noExplicitAny: polyfill
	global.window.removeEventListener = (type: string, listener: any) => {
		if (type === 'storage' && global.window._storageListeners) {
			const idx = global.window._storageListeners.indexOf(listener);
			if (idx > -1) global.window._storageListeners.splice(idx, 1);
		}
	};
	global.window.dispatchEvent = (event: Event) => {
		if (event.type === 'storage' && global.window._storageListeners) {
			// biome-ignore lint/suspicious/noExplicitAny: polyfill
			global.window._storageListeners.forEach((l: any) => {
				l(event);
			});
		}
		return true;
	};
}

if (!global.location) {
	// biome-ignore lint/suspicious/noExplicitAny: polyfill
	global.location = { href: 'http://localhost', origin: 'http://localhost' } as any;
}

// Mock StorageEvent
global.StorageEvent = class StorageEvent extends Event {
	key: string | null;
	newValue: string | null;
	constructor(type: string, init?: StorageEventInit) {
		super(type, init);
		this.key = init?.key || null;
		this.newValue = init?.newValue || null;
	}
	// biome-ignore lint/suspicious/noExplicitAny: polyfill
} as any;

// Mock MessageEvent
global.MessageEvent = class MessageEvent extends Event {
	// biome-ignore lint/suspicious/noExplicitAny: polyfill
	data: any;
	constructor(type: string, init?: MessageEventInit) {
		super(type, init);
		this.data = init?.data;
	}
	// biome-ignore lint/suspicious/noExplicitAny: polyfill
} as any;
