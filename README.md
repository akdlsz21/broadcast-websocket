# BroadcastWebsocket

Single-connection, multi-tab friendly WebSocket wrapper. Exactly one tab (leader) opens a real WebSocket; followers delegate sends and receive broadcasts via BroadcastChannel. The class implements the WebSocket interface (onopen, onmessage, send, close, addEventListener, etc.).

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
<img width="1056" height="719" alt="image" src="https://github.com/user-attachments/assets/030bdd52-15fb-4ca1-904f-a261ad133352" />

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

- Requires `BroadcastChannel` (delegation/broadcast) and `localStorage` (election) to coordinate between tabs.
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
