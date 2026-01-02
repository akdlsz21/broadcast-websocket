import { useCallback, useEffect, useState } from 'react';
import BroadcastWebsocket from 'broadcast-websocket';
import { cn } from './lib/cn';

type LogEntry = {
	id: string;
	kind: 'system' | 'incoming' | 'sent';
	text: string;
	at: string;
};

const READY_LABELS: Record<number, string> = {
	2: 'Closing',
	3: 'Closed',
};

const badgeColor = (readyState: number | undefined) => {
	if (readyState === BroadcastWebsocket.OPEN) return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
	if (readyState === BroadcastWebsocket.CONNECTING) return 'bg-amber-100 text-amber-800 ring-amber-200';
	if (readyState === BroadcastWebsocket.CLOSING) return 'bg-orange-100 text-orange-800 ring-orange-200';
	return 'bg-slate-100 text-slate-700 ring-slate-200';
};

const formatTime = (date = new Date()) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

type PanelProps = {
	id: string;
	initialUrl?: string;
	initialScope?: string;
	onRemove?: () => void;
};

function useBroadcastClient(initialUrl = 'ws://localhost:8787', initialScope = 'scope-1') {
	const [url, setUrl] = useState(initialUrl);
	const [scope, setScope] = useState(initialScope);
	const [socket, setSocket] = useState<BroadcastWebsocket | null>(null);
	const [status, setStatus] = useState<ReturnType<BroadcastWebsocket['status']>>();
	const [outbound, setOutbound] = useState('hello');
	const [logs, setLogs] = useState<LogEntry[]>([]);

	// const socketRef = useRef<BroadcastWebsocket | null>(null);
	// const socket = socketRef.current;

	const isConnected = status?.readyState === BroadcastWebsocket.OPEN;

	const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'at'> & { at?: string }) => {
		setLogs((prev) => [
			{
				id: crypto.randomUUID(),
				at: entry.at ?? formatTime(),
				...entry,
			},
			...prev,
		]);
	}, []);

	useEffect(() => {
		if (!socket) return;

		const updateStatus = () => setStatus(socket.status());
		updateStatus();

		const handleOpen: EventListener = () => {
			updateStatus();
			addLog({ kind: 'system', text: 'Connection opened' });
		};

		const handleClose: EventListener = () => {
			updateStatus();
			addLog({ kind: 'system', text: 'Connection closed' });
		};

		const handleError: EventListener = () => {
			updateStatus();
			addLog({ kind: 'system', text: 'Connection error' });
		};

		const handleMessage: EventListener = (ev) => {
			const message = ev as MessageEvent;
			addLog({ kind: 'incoming', text: `${message.data}` });
		};
		socket.addEventListener('message');

		const handleSent: EventListener = (ev) => {
			const detail = (ev as CustomEvent).detail;
			addLog({ kind: 'sent', text: `${detail}` });
		};

		const ws = new WebSocket('ws://localhost:8787');
		ws.addEventListener('', (ev) => {
			console.log('[APP] ws message:', ev.data);
		});

		socket.addEventListener('open', handleOpen);
		socket.addEventListener('close', handleClose);
		socket.addEventListener('error', handleError);
		socket.addEventListener('message', handleMessage);
		socket.addEventListener('sent', handleSent);
		// const ws = new WebSocket('ws://localhost:8787');
		// ws.addEventListener("")
		return () => {
			socket.removeEventListener('open', handleOpen);
			socket.removeEventListener('close', handleClose);
			socket.removeEventListener('error', handleError);
			socket.removeEventListener('message', handleMessage);
			socket.removeEventListener('sent', handleSent);
		};
	}, [socket, addLog]);

	// useEffect(() => () => socket?.dispose(), [socket]);

	const connect = () => {
		const bws = new BroadcastWebsocket(url.trim(), { scope });
		setSocket(bws);
		addLog({ kind: 'system', text: `Connecting to ${url.trim()} with scope "${scope}"` });
	};

	const disconnect = () => {
		socket?.dispose();
		setSocket(null);
	};

	const send = () => {
		if (!socket) return;
		try {
			const payload = JSON.stringify({ message: outbound });
			socket.send(payload);
		} catch (err) {
			console.warn('Send failed:', err);
			addLog({ kind: 'system', text: 'Send failed. Check console for details.' });
		}
	};

	const summary = status
		? [
				{ label: 'Role', value: status.isLeader ? 'Leader' : 'Follower' },
				{ label: 'Leader ID', value: status.leaderId ?? '—' },
				{ label: 'Socket ID', value: status.id },
				{ label: 'Buffered', value: `${status.bufferedAmount} bytes` },
		  ]
		: null;

	return {
		url,
		setUrl,
		scope,
		setScope,
		status,
		isConnected,
		summary,
		outbound,
		setOutbound,
		connect,
		disconnect,
		send,
		logs,
	};
}

function ControlPanel({ id, initialUrl, initialScope, onRemove }: PanelProps) {
	const { url, setUrl, scope, setScope, status, isConnected, summary, outbound, setOutbound, connect, disconnect, send, logs, clearLogs } =
		useBroadcastClient(initialUrl, initialScope);

	return (
		<div className="min-w-0 rounded-lg border border-slate-200 bg-white text-sm shadow-sm overflow-hidden">
			<div className="flex flex-col divide-y divide-slate-200">
				<header className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
					<span>Panel {id.slice(0, 4)}</span>
					{onRemove && (
						<button
							type="button"
							onClick={onRemove}
							className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-rose-400 hover:text-rose-500"
						>
							Remove
						</button>
					)}
				</header>
				<section className="grid gap-3 p-3 min-w-0">
					<div className="grid gap-2 md:grid-cols-2 min-w-0">
						<label className="block min-w-0 text-slate-700" htmlFor="ws-url-input">
							<span className="mb-1 block text-xs text-slate-500">WebSocket URL</span>
							<input
								id="ws-url-input"
								className="w-full min-w-0 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								placeholder="ws://localhost:8787"
								autoComplete="off"
							/>
						</label>
						<label className="block min-w-0 text-slate-700" htmlFor="scope-input">
							<span className="mt-1 block text-xs text-slate-500 text-nowrap">
								Scope: (<span>Isolate traffic per scope.</span>)
							</span>
							<input
								id="scope-input"
								className="w-full min-w-0 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
								value={scope}
								onChange={(e) => setScope(e.target.value)}
								placeholder="demo"
								autoComplete="off"
							/>
						</label>
					</div>

					<div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 space-y-2">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div
								className={cn(
									'inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset',
									badgeColor(status?.readyState)
								)}
							>
								<span className="inline-block h-2 w-2 rounded-full bg-current" />
								{READY_LABELS[status?.readyState ?? BroadcastWebsocket.CLOSED]}
							</div>
							<div className="flex items-center gap-2 text-sm">
								<button
									type="button"
									onClick={connect}
									className="rounded-md bg-slate-900 px-3 py-2 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
									disabled={!url.trim()}
								>
									Connect
								</button>
								<button
									type="button"
									onClick={disconnect}
									className="rounded-md border border-slate-200 px-3 py-2 font-semibold text-slate-700 transition hover:border-rose-400 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
									disabled={!isConnected && !status}
								>
									Disconnect
								</button>
								<span className="text-xs text-slate-500">{isConnected ? 'Connected' : 'Connect once per scope.'}</span>
							</div>
						</div>
						<dl className="grid grid-cols-2 gap-2">
							<div>
								<dt className="text-[11px] uppercase tracking-wide text-slate-500">Ready</dt>
								<dd className="font-medium">{READY_LABELS[status?.readyState ?? BroadcastWebsocket.CLOSED]}</dd>
							</div>
							{summary?.map((item: { label: string; value: string }) => (
								<div key={item.label}>
									<dt className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</dt>
									<dd className="font-medium">{item.value}</dd>
								</div>
							))}
						</dl>
						<p className="mt-2 text-xs text-slate-600">
							{!status
								? 'Not connected yet.'
								: status.isLeader
								? 'Leader: connects to the server.'
								: 'Follower: delegates sends to the leader.'}
						</p>
					</div>
				</section>

				<section className="grid gap-2 border-t border-slate-200 p-2 min-w-0">
					<div className="flex flex-wrap items-end gap-2">
						<div className="flex-1 min-w-[220px] space-y-1">
							<label htmlFor="message-input" className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
								Message
							</label>
							<input
								id="message-input"
								value={outbound}
								onChange={(e) => setOutbound(e.target.value)}
								className="w-full min-w-0 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
								placeholder="hello"
							/>
						</div>
						<div className="flex items-center gap-2 text-sm">
							<button
								type="button"
								onClick={send}
								className="rounded-md bg-emerald-600 px-3 py-2 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
								disabled={!isConnected || !outbound.trim()}
							>
								Send
							</button>
							<span className="text-xs text-slate-500">{isConnected ? 'Ready' : 'Connect first'}</span>
						</div>
					</div>

					<div className="space-y-1 min-w-0">
						<div
							className="h-72 overflow-auto rounded border border-slate-200 bg-white text-sm min-w-0"
							role="log"
							aria-live="polite"
						>
							{logs.length === 0 && <p className="px-2 py-1 text-slate-500">No events yet.</p>}
							{logs.map((entry: LogEntry) => (
								<div
									key={entry.id}
									className="flex items-start gap-1 border-b border-slate-100 px-2 py-1 last:border-none min-w-0 text-[11px]"
								>
									<span className="shrink-0 uppercase text-slate-600">[{entry.kind}]</span>
									<p className="shrink-0 text-slate-500">{entry.at}</p>
									<p className="flex-1 min-w-0 break-words whitespace-pre-wrap font-mono text-slate-800">{entry.text}</p>
								</div>
							))}
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}

function App() {
	const [panels, setPanels] = useState(() => [
		{
			id: crypto.randomUUID(),
			initialUrl: 'ws://localhost:8787',
			initialScope: 'scope-one',
		},
	]);

	const addPanel = () => {
		setPanels((prev) => [
			...prev,
			{
				id: crypto.randomUUID(),
				initialUrl: 'ws://localhost:8787',
				initialScope: `scope-one`,
			},
		]);
	};

	const removePanel = (id: string) => {
		setPanels((prev) => prev.filter((panel) => panel.id !== id));
	};

	return (
		<div className="min-h-screen bg-slate-50 text-slate-900">
			<div className="mx-auto max-w-6xl px-3 py-5 space-y-3">
				<div className="flex items-center justify-between">
					<h1 className="text-lg font-semibold text-slate-900">Broadcast Websocket Panels</h1>
					<button
						type="button"
						onClick={addPanel}
						className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
					>
						Add Panel
					</button>
				</div>
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{panels.map((panel) => (
						<ControlPanel
							key={panel.id}
							id={panel.id}
							initialUrl={panel.initialUrl}
							initialScope={panel.initialScope}
							onRemove={panels.length > 1 ? () => removePanel(panel.id) : undefined}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

export default App;
