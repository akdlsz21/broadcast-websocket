/**
 * Minimal WebSocket echo/broadcast server for local testing.
 */

import { WebSocket, WebSocketServer } from 'ws';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const wss = new WebSocketServer({ port: PORT });

console.log(`[server] Listening on ws://localhost:${PORT}`);

wss.on('connection', (ws, req) => {
	const id = Math.random().toString(36).slice(2, 8);
	const ip = req.socket.remoteAddress;
	console.log(`[server] Client connected ${id} from ${ip}`);

	// Send welcome message
	send(ws, { type: 'hello', id, ts: Date.now(), note: 'Welcome to simple WS server' });

	// Broadcast join
	broadcast({ type: 'join', id, ts: Date.now() }, ws);

	ws.on('message', (data) => {
		let text;
		if (typeof data === 'string') text = data;
		else if (Buffer.isBuffer(data)) text = data.toString('utf8');
		else text = String(data);

		console.log(`[server] <- ${id}:`, text);

		let msg = text;
		try {
			msg = JSON.parse(String(data));
		} catch {
			/* keep as-is */
		}

		const payload = {
			type: 'message',
			from: id,
			ts: Date.now(),
			data: msg,
			response: `response to ${text}`,
		};

		// Echo back
		send(ws, payload);
		// Broadcast to others
		broadcast(payload, ws);
	});

	ws.on('close', () => {
		console.log(`[server] Client disconnected ${id}`);
		broadcast({ type: 'leave', id, ts: Date.now() });
	});

	ws.on('error', (err) => {
		console.warn(`[server] Error ${id}:`, err?.message || err);
	});
});

function broadcast(obj, except) {
	const data = JSON.stringify(obj);
	for (const client of wss.clients) {
		if (client.readyState === WebSocket.OPEN && client !== except) {
			try {
				client.send(data);
			} catch {}
		}
	}
}

function send(ws, obj) {
	if (ws.readyState === WebSocket.OPEN) {
		try {
			ws.send(JSON.stringify(obj));
		} catch {}
	}
}

// Graceful shutdown
const shutdown = () => {
	console.log('\n[server] Shutting down...');
	wss.close(() => {
		console.log('[server] Closed.');
		process.exit(0);
	});
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
