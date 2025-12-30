export function randomId(len = 16): string {
	const arr = new Uint8Array(len);
	crypto.getRandomValues(arr);
	return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function now(): number {
	return Date.now();
}

export function safeJsonStringify(v: unknown): string {
	try {
		return JSON.stringify(v);
	} catch {
		return 'null';
	}
}
