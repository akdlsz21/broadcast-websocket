import BWS, { type BroadcastWebsocket } from '../src/index';

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

(() => {
	const params = new URLSearchParams(location.search);
	const name = params.get('name') || 'Widget';
	const url = params.get('url') || 'ws://localhost:8787';

	// Optional pane label
	const $name = getEl('name');
	if ($name) $name.textContent = `Widget: ${name}`;

	const bws = new BWS(url, {
		heartbeatMs: 120,
	});

	const $log = mustEl('log');
	const $meta = getEl('meta'); // simple.html
	const $leader = getEl('leader'); // pane.html
	const $state = getEl('state'); // pane.html
	const $role = getEl('role'); // pane.html banner

	const $send = mustEl<HTMLButtonElement>('send');
	const $text = mustEl<HTMLInputElement>('text');

	function render() {
		const s = (bws as BroadcastWebsocket).status();
		if ($meta) {
			$meta.textContent = `leader=${s.isLeader ? 'yes' : 'no'} leaderId=${s.leaderId || '—'} state=${s.readyState} buffered=${
				s.bufferedAmount
			}`;
		}
		if ($leader) $leader.textContent = s.isLeader ? 'yes' : `no (leaderId=${s.leaderId || '—'})`;
		if ($state) $state.textContent = String(s.readyState);
		if ($role) $role.textContent = s.isLeader ? 'Leader' : 'Follower';
		document.body.classList.toggle('role-leader', s.isLeader);
		document.body.classList.toggle('role-follower', !s.isLeader);
	}

	// Wire WebSocket-like handlers
	bws.onopen = () => {
		appendLog($log, `open (url=${url})`, 'system');
		render();
	};
	bws.onmessage = (e) => {
		const status = (bws as BroadcastWebsocket).status();
		appendLog($log, 'message ' + String(e.data), status.isLeader ? 'message-direct' : 'message-delegated');
	};
	bws.onerror = () => appendLog($log, 'error', 'system');
	bws.onclose = () => {
		appendLog($log, 'close', 'system');
		render();
	};

	function doSend() {
		const raw = $text.value;
		if (!raw || !raw.trim()) return; // ignore empty
		// Send text frames (string). If JSON is typed, pass it through as-is.
		const payload = raw;
		const status = (bws as BroadcastWebsocket).status();
		try {
			bws.send(payload);
			appendLog($log, 'send ' + payload, status.isLeader ? 'send-direct' : 'send-delegated');
			$text.value = '';
		} catch (err) {
			appendLog($log, 'send-error ' + String(err), 'system');
		}
	}

	$send.addEventListener('click', doSend);
	$text.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			doSend();
		}
	});

	// Initial render tick
	render();
})();
