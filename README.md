# BroadcastWebsocket (MVP)

Single-connection, multi-tab friendly WebSocket wrapper. Exactly one tab (leader) opens a real WebSocket; followers delegate sends and receive broadcasts via BroadcastChannel. The class implements the WebSocket interface (onopen, onmessage, send, close, addEventListener, etc.).

Status: MVP

## Install

This repository is a package scaffold. Build before use:

- npm i -D tsup typescript
- npm run build

Then import from `dist/index.js` (ESM) or `dist/index.cjs` (CJS).

## Quick Start

```ts
import BroadcastWebsocket from 'broadcast-websocket';

const bws = new BroadcastWebsocket('wss://example/ws');

bws.onopen = () => console.log('open');
bws.onmessage = (e) => console.log('message', e.data);
bws.onclose = () => console.log('close');

bws.send(JSON.stringify({ hello: 'world' }));
```

Create a `BroadcastWebsocket` in each tab or iframe. The leader opens the socket; followers delegate `send()` via BroadcastChannel and receive messages broadcast by the leader. Zero-queue: sends can drop if the leader isn’t ready.

## Architecture

```
+---------------------------------------------------------------------------------------+
|                                    BroadcastWebsocket                                 |
|---------------------------------------------------------------------------------------|
| Constructor                                                                          |
|  • Accepts `url`, optional WebSocket protocols, optional `scope`.                     |
|  • Derives `scope` → used to namespace election + bus (browser-origin scoped).        |
|                                                                                       |
| Internal Composition                                                                  |
|  ┌───────────────────────────┐        ┌────────────────────┐                          |
|  | SimpleElection (controller)|<──────>| BroadcastChannel BC|                          |
|  |   scope = "bws:scope"     |        | name = "bws:bus:… " |                          |
|  |   emits: leader/follower  |        |  ⇣ Bus wrapper      |                          |
|  └──────────────┬────────────┘        └──────────┬──────────┘                          |
|                 |                                 |                                     |
|                 | leader → open socket            | forwards messages between tabs      |
|                 | follower → close socket         |                                     |
|                 v                                 v                                     |
|        ┌────────────────┐                ┌──────────────────────────────┐               |
|        | window.WebSocket|                | Bus.post / Bus.on            |               |
|        |  (real network) |                |  {kind:'out'|'in'|'sys',…}    |               |
|        └─┬───────────────┘                └──────────────┬───────────────┘               |
|          │                                              │                               |
|          │ onopen/message/error/close                   │ delivers events via Broadcast |
|          │ emit → BroadcastWebsocket emitter            │ Channel to other panes        |
|          │                                              │                               |
|          ▼                                              ▼                               |
|  BroadcastWebsocket exposes WebSocket-like surface:                                     |
|   - readyState/bufferedAmount/status()                                                     |
|   - send(): leader sends on ws; follower delegates via Bus (`kind:'out'`)                  |
|   - close(): leader closes real socket; follower emits synthetic close                     |
|   - EventTarget: addEventListener / onopen/onmessage/onerror/onclose                      |
|                                                                                           |
| Delegation Flow                                                                           |
|   Follower send() ──> Bus.post {kind:'out'} ──> Leader Bus listener ──> ws.send()         |
|   Leader message ──> ws.onmessage ──> Bus.post {kind:'in'} ──> Followers emit message     |
|   Leader lifecycle ──> Bus.post {kind:'sys'} ──> Followers mirror open/close transitions   |
|                                                                                           |
| Disposal                                                                                  |
|   dispose() → close ws, stop election, unsubscribe bus, close channel                     |
+---------------------------------------------------------------------------------------+
```

## Options

- `scope?: string` — Leader election namespace (defaults to URL origin)
- `protocols?: string | string[]` — WebSocket subprotocols

## Events

- WebSocket-like: `open`, `message`, `error`, `close`

## Demos

Local echo demos:

1. Install dev deps: `npm i -D tsup typescript`
2. Build: `npm run build`
3. Install the demo server dependency: `npm i ws`
4. Start the demo server: `npm run demo:server` (listens on `ws://localhost:8787`)
5. Serve the folder (any static server) and open:
   - `demo/simple.html` in two tabs
   - `demo/frames.html` (two iframes in one tab)
6. Type messages. The leader connects to the local server; follower sends are delegated via BroadcastChannel; inbound messages are broadcast to followers.

Iframe-based demo (single tab, two iframes):

1. Build: `npm run build`
2. Start the demo server: `npm run demo:server`
3. Serve the folder and open `demo/frames.html` (it loads two `pane.html` iframes)
4. Try sending from either pane; one iframe becomes leader, the other follows.

Note: Zero-queue — if the leader is not connected yet, follower sends posted via BroadcastChannel may be dropped.

## Caveats

- Requires `BroadcastChannel` (delegation/broadcast) and `localStorage` (election); there is no fallback in this MVP.
- Browser WebSocket API does not expose native ping/pong. If you need keepalives, implement app-level pings.
- No buffering/queues: follower sends emitted before leader is ready may be dropped.

## Build & Publish

- Build (ESM + CJS + types): `npm run build`
- Dry-run publish: `npm publish --dry-run`

Exports

- ESM: `dist/index.js`
- CJS: `dist/index.cjs`
- Types: `dist/index.d.ts`

## License

MIT
