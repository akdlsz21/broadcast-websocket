import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BroadcastWebsocket from 'broadcast-websocket';
import { cn } from './lib/cn';
import { Card } from './components/Card';

type LogEntry = {
	id: string;
	kind: 'system' | 'incoming' | 'sent';
	text: string;
	at: string;
};

const readyLabels: Record<number, string> = {
	0: 'Connecting',
	1: 'Open',
	2: 'Closing',
	3: 'Closed',
};

const badgeColor = (readyState: number | undefined) => {
	if (readyState === 1) return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
	if (readyState === 0) return 'bg-amber-100 text-amber-800 ring-amber-200';
	if (readyState === 2) return 'bg-orange-100 text-orange-800 ring-orange-200';
	return 'bg-slate-100 text-slate-700 ring-slate-200';
};

function formatTime(date = new Date()) {
	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function App() {
	const [url, setUrl] = useState('ws://localhost:8787');
	const [scope, setScope] = useState('demo');
	const [socket, setSocket] = useState<BroadcastWebsocket | null>(null);
	const [status, setStatus] = useState(() => socket?.status());
	const [outbound, setOutbound] = useState('{"message":"hello"}');
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const logRef = useRef<HTMLDivElement | null>(null);

	const isConnected = status?.readyState === BroadcastWebsocket.OPEN;

	useEffect(() => {
		if (!logRef.current) return;
		if (logs.length === 0) return;
		logRef.current.scrollTop = logRef.current.scrollHeight;
	}, [logs]);

	const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'at'> & { at?: string }) => {
		setLogs((prev) => [
			...prev,
			{
				id: crypto.randomUUID(),
				at: entry.at ?? formatTime(),
				...entry,
			},
		]);
	}, []);

	useEffect(() => {
		if (!socket) return;

		const updateStatus = () => setStatus(socket.status());

		const handleOpen: EventListener = () => {
			updateStatus();
			addLog({ kind: 'system', text: 'Connection opened' });
		};

		const handleClose: EventListener = () => {
			updateStatus();
			addLog({ kind: 'system', text: 'Connection closed' });
		};

		const handleMessage: EventListener = (ev) => {
			const message = ev as MessageEvent;
			addLog({ kind: 'incoming', text: `${message.data}` });
		};

		const handleSent: EventListener = (ev) => {
			const detail = (ev as CustomEvent).detail;
			addLog({ kind: 'sent', text: `${detail}` });
		};

		socket.addEventListener('open', handleOpen);
		socket.addEventListener('close', handleClose);
		socket.addEventListener('message', handleMessage);
		socket.addEventListener('sent', handleSent);

		const statusTimer = window.setInterval(updateStatus, 500);

		return () => {
			socket.removeEventListener('open', handleOpen);
			socket.removeEventListener('close', handleClose);
			socket.removeEventListener('message', handleMessage);
			socket.removeEventListener('sent', handleSent);
			window.clearInterval(statusTimer);
		};
	}, [socket, addLog]);

	const connect = () => {
		if (socket) {
			socket.dispose();
		}
		const instance = new BroadcastWebsocket(url, { scope });
		setSocket(instance);
		setStatus(instance.status());
		addLog({ kind: 'system', text: `Connecting to ${url} (scope: ${scope})` });
	};

	const disconnect = () => {
		socket?.dispose();
		setSocket(null);
		setStatus(undefined);
		addLog({ kind: 'system', text: 'Disconnected' });
	};

	const send = () => {
		if (!socket) {
			addLog({ kind: 'system', text: 'No connection yet' });
			return;
		}
		try {
			socket.send(outbound);
			addLog({ kind: 'sent', text: outbound });
		} catch (err) {
			addLog({ kind: 'system', text: `Send failed: ${(err as Error).message}` });
		}
	};

	const summary = useMemo(() => {
		if (!status) return null;
		return [
			{ label: 'Role', value: status.isLeader ? 'Leader' : 'Follower' },
			{ label: 'Leader ID', value: status.leaderId ?? '—' },
			{ label: 'Socket ID', value: status.id },
			{ label: 'Buffered', value: `${status.bufferedAmount} bytes` },
		];
	}, [status]);

	return (
		<div className="min-h-screen bg-slate-50 text-slate-900">
			<div className="mx-auto flex max-w-5xl flex-col gap-5 px-5 py-10">
				<header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
					<div className="space-y-1">
						<p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Broadcast Websocket</p>
						<h1 className="text-3xl font-semibold leading-tight">Multi-context WebSocket demo</h1>
						<p className="text-sm text-slate-600">
							One leader context connects; others forward messages over BroadcastChannel. Light, text-first controls.
						</p>
					</div>
					<div
						className={cn(
							'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
							badgeColor(status?.readyState)
						)}
					>
						<span className="inline-block h-2 w-2 rounded-full bg-current" />
						{readyLabels[status?.readyState ?? 3]}
					</div>
				</header>

				<Card title="How it works" description="A quick pass on the multi-context flow">
					<div className="grid gap-3 md:grid-cols-3">
						<div className="text-sm text-slate-700">
							<p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">01 Open contexts</p>
							<p>Load this page in multiple windows or views. One context takes the leader role automatically.</p>
						</div>
						<div className="text-sm text-slate-700">
							<p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">02 Point at your server</p>
							<p>Set the WebSocket URL and scope below. Only the leader connects to the server.</p>
						</div>
						<div className="text-sm text-slate-700">
							<p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">03 Send & watch</p>
							<p>Send any payload. Followers relay via BroadcastChannel; the leader forwards to the socket.</p>
						</div>
					</div>
				</Card>

				<Card title="Connection" description="Point to a WebSocket and keep contexts in sync">
					<div className="grid gap-4 md:grid-cols-[1.4fr,1fr]">
						<div className="space-y-3">
							<label className="block text-sm text-slate-700">
								<span className="mb-1 block text-xs text-slate-500">WebSocket URL</span>
								<input
									className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
									value={url}
									onChange={(e) => setUrl(e.target.value)}
									placeholder="ws://localhost:8787"
								/>
							</label>
							<label className="block text-sm text-slate-700">
								<span className="mb-1 block text-xs text-slate-500">Scope</span>
								<input
									className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
									value={scope}
									onChange={(e) => setScope(e.target.value)}
									placeholder="demo"
								/>
								<p className="mt-1 text-xs text-slate-500">Scopes keep traffic separated per app or test.</p>
							</label>

							<div className="flex flex-wrap gap-2 text-sm">
								<button
									type="button"
									onClick={connect}
									className="rounded-md bg-slate-900 px-3 py-2 font-semibold text-white transition hover:bg-slate-800"
								>
									Connect
								</button>
								<button
									type="button"
									onClick={disconnect}
									className="rounded-md border border-slate-200 px-3 py-2 font-semibold text-slate-700 transition hover:border-rose-400 hover:text-rose-500"
								>
									Disconnect
								</button>
								<span className="flex items-center text-xs text-slate-500">
									{isConnected ? 'This context is live.' : 'Connect once per scope.'}
								</span>
							</div>
						</div>

						<div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800">
							<p className="text-xs uppercase tracking-wide text-slate-500">Status snapshot</p>
							<dl className="mt-2 grid grid-cols-2 gap-3">
								<div>
									<dt className="text-[11px] uppercase tracking-wide text-slate-500">Ready</dt>
									<dd className="font-medium">{readyLabels[status?.readyState ?? 3]}</dd>
								</div>
								{summary?.map((item) => (
									<div key={item.label}>
										<dt className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</dt>
										<dd className="font-medium">{item.value}</dd>
									</div>
								))}
							</dl>
							<p className="mt-2 text-xs text-slate-500">
								{!status
									? 'Not connected yet.'
									: status.isLeader
									? 'Leader: this context connects to the server.'
									: 'Follower: this context delegates sends to the leader.'}
							</p>
						</div>
					</div>
				</Card>

				<Card title="Messages & activity" description="Send raw payloads and watch the stream">
					<div className="grid gap-5 md:grid-cols-2">
						<div className="space-y-2">
							<p className="text-xs uppercase tracking-wide text-slate-500">Outbound payload</p>
							<textarea
								value={outbound}
								onChange={(e) => setOutbound(e.target.value)}
								rows={8}
								className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
							/>
							<div className="flex items-center gap-3 text-sm">
								<button
									type="button"
									onClick={send}
									className="rounded-md bg-emerald-600 px-3 py-2 font-semibold text-white transition hover:bg-emerald-500"
								>
									Send
								</button>
								<span className="text-xs text-slate-500">{isConnected ? 'Ready to send' : 'Connect first'}</span>
							</div>
							<p className="text-xs text-slate-500">
								Use JSON, text, or binary-friendly strings. Followers forward without opening their own sockets.
							</p>
						</div>

						<div className="space-y-2">
							<header className="flex items-center justify-between">
								<div>
									<p className="text-xs uppercase tracking-wide text-slate-500">Activity stream</p>
									<p className="text-sm text-slate-700">Open multiple windows or views to see leader/follower hand-offs.</p>
								</div>
								<button
									type="button"
									onClick={() => setLogs([])}
									className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-indigo-400 hover:text-indigo-600"
								>
									Clear
								</button>
							</header>
							<div ref={logRef} className="max-h-72 overflow-auto rounded-md border border-slate-200 bg-white text-sm">
								{logs.length === 0 && <p className="px-3 py-2 text-slate-500">No events yet.</p>}
								{logs.map((entry) => (
									<div key={entry.id} className="flex items-start gap-3 border-b border-slate-100 px-3 py-2 last:border-none">
										<span
											className={cn(
												'inline-flex items-center rounded-full px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-slate-200',
												entry.kind === 'system' && 'text-indigo-700 ring-indigo-200',
												entry.kind === 'incoming' && 'text-sky-700 ring-sky-200',
												entry.kind === 'sent' && 'text-emerald-700 ring-emerald-200'
											)}
										>
											{entry.kind}
										</span>
										<div className="flex-1 space-y-1">
											<p className="font-mono text-xs text-slate-800">{entry.text}</p>
											<p className="text-[11px] text-slate-500">{entry.at}</p>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</Card>
			</div>
		</div>
	);
}

export default App;
