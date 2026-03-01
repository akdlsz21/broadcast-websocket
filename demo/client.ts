import { SharedWsTransport } from '../src/index';
import type { BusPayload, StatusSnapshot, TransportCloseDetail } from '../src/types';

function getEl<T extends HTMLElement = HTMLElement>(id: string): T | null {
	return document.getElementById(id) as T | null;
}

function mustEl<T extends HTMLElement = HTMLElement>(id: string): T {
	const el = getEl<T>(id);
	if (!el) throw new Error(`Missing #${id}`);
	return el;
}

type LogKind = 'system' | 'send-direct' | 'send-delegated' | 'message-direct' | 'message-delegated';

function appendLog($log: HTMLElement, line: string, kind: LogKind = 'system') {
	const div = document.createElement('div');
	div.classList.add('line', kind);
	div.textContent = `[${new Date().toLocaleTimeString()}] ${line}`;
	$log.appendChild(div);
	$log.scrollTop = $log.scrollHeight;
}

function formatPayload(payload: BusPayload) {
	if (typeof payload === 'string') return payload;
	return new TextDecoder().decode(payload);
}

(() => {
	const params = new URLSearchParams(location.search);
	const name = params.get('name') || 'Widget';
	const url = params.get('url') || 'ws://localhost:8787';

	const $name = getEl('name');
	if ($name) $name.textContent = `Widget: ${name}`;

	const transport = new SharedWsTransport(url, {
		heartbeatMs: 120,
	});

	const $log = mustEl('log');
	const $meta = getEl('meta');
	const $leader = getEl('leader');
	const $state = getEl('state');
	const $role = getEl('role');

	const $send = mustEl<HTMLButtonElement>('send');
	const $text = mustEl<HTMLInputElement>('text');

	function render() {
		const s: StatusSnapshot = transport.status();
		if ($meta) {
			$meta.textContent = `role=${s.role} leaderId=${s.leaderId || '—'} state=${s.transportState}`;
		}
		if ($leader) $leader.textContent = s.role === 'leader' ? 'yes' : `no (leaderId=${s.leaderId || '—'})`;
		if ($state) $state.textContent = s.transportState;
		if ($role) $role.textContent = s.role === 'leader' ? 'Leader' : 'Follower';
		document.body.classList.toggle('role-leader', s.role === 'leader');
		document.body.classList.toggle('role-follower', s.role !== 'leader');
	}

	transport.addEventListener('transport_open', () => {
		appendLog($log, `transport_open (url=${url})`, 'system');
		render();
	});

	transport.addEventListener('message', (event) => {
		const detail = (event as CustomEvent<{ data: BusPayload }>).detail;
		const status = transport.status();
		appendLog($log, `message ${formatPayload(detail.data)}`, status.role === 'leader' ? 'message-direct' : 'message-delegated');
	});

	transport.addEventListener('transport_error', () => appendLog($log, 'transport_error', 'system'));

	transport.addEventListener('transport_close', (event) => {
		const detail = (event as CustomEvent<TransportCloseDetail>).detail;
		appendLog($log, `transport_close code=${detail.code} reason=${detail.reason}`, 'system');
		render();
	});

	transport.addEventListener('role_change', () => {
		render();
	});

	function doSend() {
		const raw = $text.value;
		if (!raw || !raw.trim()) return;
		const payload = raw;
		const status = transport.status();
		try {
			transport.send(payload);
			appendLog($log, `send ${payload}`, status.role === 'leader' ? 'send-direct' : 'send-delegated');
			$text.value = '';
		} catch (err) {
			appendLog($log, `send-error ${String(err)}`, 'system');
		}
	}

	$send.addEventListener('click', doSend);
	$text.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			doSend();
		}
	});

	render();
})();
