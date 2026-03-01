Shared WebSocket Transport. Exactly one context (leader) opens a real WebSocket; other contexts attach via BroadcastChannel and delegate sends, while all contexts receive inbound messages.

One physical WebSocket per {url, scope}. Leader tab owns transport. Other tabs attach and delegate send; all tabs receive messages.

## Install

This repository is a package scaffold. Build before use:

- npm i -D tsup typescript
- npm run build

Then import from `dist/index.js` (ESM) or `dist/index.cjs` (CJS).

## Quick Start

```ts
import SharedWsTransport from 'broadcast-websocket';

const transport = new SharedWsTransport('wss://example/ws');

transport.addEventListener('transport_open', () => console.log('open'));
transport.addEventListener('message', (event) => {
	const detail = event as CustomEvent<{ data: string | ArrayBuffer }>;
	console.log('message', detail.detail.data);
});
transport.addEventListener('transport_close', (event) => {
	const detail = event as CustomEvent<{ code: number; reason: string; wasClean: boolean }>;
	console.log('close', detail.detail);
});

transport.send(JSON.stringify({ hello: 'world' }));
```

Create a `SharedWsTransport` in each browsing context (page, window, embedded view). The leader opens the socket; the rest delegate `send()` via BroadcastChannel and receive messages broadcast by the leader. `send()` throws unless `transportState === 'open'`.

## API

Methods:

- `send(data)`
- `terminate(code?, reason?)`
- `detach()` / `dispose()`
- `status()` → `{ id, role, leaderId, transportState, url, scope }`

State:

- `transportState`: `'connecting' | 'open' | 'closing' | 'closed'`
- `role`: `'leader' | 'follower'`

Events:

- `transport_open`
- `transport_close` → `{ code, reason, wasClean }`
- `transport_error` → `{ error?: unknown }`
- `message` → `{ data }`
- `role_change` → `{ role, leaderId }`

## Options

```ts
type Options = {
	scope?: string; // defaults to URL origin
	protocols?: string | string[];
	heartbeatMs?: number;
	timeoutMs?: number;
	debug?: boolean;
	logger?: (message: string, detail?: Record<string, unknown>) => void;
};
```

## Architecture

<img width="1056" height="719" alt="image" src="https://github.com/user-attachments/assets/067afba6-a9fc-4918-aeb8-da8bc6e8384a" />

## Demos

Local echo demos:

1. Install dev deps: `npm i -D tsup typescript`
2. Build: `npm run build`
3. Install the demo server dependency: `npm i ws`
4. Start the demo server: `npm run demo:server` (listens on `ws://localhost:8787`)
5. Serve the folder (any static server) and open:
   - `demo/simple.html` in two windows or side-by-side browser contexts
   - `demo/frames.html` (two embedded clients on one page)
6. Type messages. The leader connects to the local server; follower sends are delegated via BroadcastChannel; inbound messages are broadcast to followers.

React demo (Vite + Tailwind):

1. Build the library once so the local file dependency has `dist/`: `pnpm build`
2. Install demo deps and link the local package: `pnpm -C demo/react install`
3. Start the echo server: `pnpm demo:server` (listens on `ws://localhost:8787`)
4. Run the React demo: `pnpm demo:react` (then open the shown URL; open multiple windows to see leader/follower behavior)

Embedded demo (single page with two client panes):

1. Build: `npm run build`
2. Start the demo server: `npm run demo:server`
3. Serve the folder and open `demo/frames.html` (it loads two `pane.html` client panes)
4. Try sending from either pane; one becomes leader, the other follows.

## Caveats

- Requires `BroadcastChannel` (delegation/broadcast) and `localStorage` (election) to coordinate between contexts.
- Browser WebSocket API does not expose native ping/pong. If you need keepalives, implement app-level pings.
- No buffering/queues: `send()` throws unless the leader transport is open.

## Build & Publish

- Build (ESM + CJS + types): `npm run build`
- Dry-run publish: `npm publish --dry-run`

Note: Only `dist/` is published (see `package.json#files`); demos and docs stay out of the npm tarball.

Exports

- ESM: `dist/index.js`
- CJS: `dist/index.cjs`
- Types: `dist/index.d.ts`

## License

MIT
