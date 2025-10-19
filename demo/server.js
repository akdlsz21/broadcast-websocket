// Minimal WebSocket echo/broadcast server for local testing.
// Usage:
//   npm install ws
//   node demo/server.js
// Connect demo to: ws://localhost:8787

import { WebSocketServer } from 'ws';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const wss = new WebSocketServer({ port: PORT });

function broadcast(obj, except) {
  const data = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1 && client !== except) {
      try { client.send(data); } catch {}
    }
  }
}

wss.on('connection', (ws, req) => {
  const id = Math.random().toString(36).slice(2, 8);
  const ip = req.socket.remoteAddress;
  console.log(`[server] client connected ${id} from ${ip}`);

  ws.send(JSON.stringify({ type: 'hello', id, ts: Date.now(), note: 'Welcome to simple WS server' }));
  broadcast({ type: 'join', id, ts: Date.now() }, ws);

  ws.on('message', (data) => {
    console.log("🚀 ~ data:", data)
    // Log raw inbound message
    let text;
    if (typeof data === 'string') text = data;
    else if (Buffer.isBuffer(data)) text = data.toString('utf8');
    else text = String(data);
    console.log(`[server] <- ${id}:`, text);

    let msg = text
    try { msg = JSON.parse(String(data)); } catch { /* keep as-is */ }
    const wrapped = { type: 'message', from: id, ts: Date.now(), data: msg };
    // echo back to sender
    try { ws.send(JSON.stringify(wrapped)); } catch {}
    // also broadcast to others
    broadcast(wrapped, ws);
  });

  ws.on('close', () => {
    console.log(`[server] client disconnected ${id}`);
    broadcast({ type: 'leave', id, ts: Date.now() });
  });

  ws.on('error', (err) => {
    console.warn(`[server] error ${id}:`, err?.message || err);
  });
});

wss.on('listening', () => {
  console.log(`[server] listening on ws://localhost:${PORT}`);
});
