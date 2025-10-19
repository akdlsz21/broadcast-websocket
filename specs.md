# BroadcastWebsocket — Package Specification (MVP)

> Status: MVP
>
> Goal: Provide a single-connection, multi-tab/WebView–friendly WebSocket client. Exactly one tab (“leader”) opens a native `WebSocket`; other tabs (“followers”) share that connection via `BroadcastChannel`.

---

## 1. Overview

- Problem: In environments like OBS (multiple web widgets, same origin), each widget opens its own WebSocket to the same chat server — redundant and wasteful.
- Solution: A BroadcastWebsocket class that:
  - Elects exactly one leader tab to hold a real `WebSocket` to the server.
  - Followers delegate outbound messages to a `BroadcastChannel` for the leader to forward.
  - The leader rebroadcasts inbound server messages to all followers via `BroadcastChannel`.
- Constraint: No `SharedWorker`. MVP uses `BroadcastChannel` only (no fallback), and localStorage for simple leader election.

---

## 2. Design Principles

1. Composition over inheritance: `BroadcastWebsocket` wraps a native `WebSocket` (leader) but is not a subclass. It exposes a WebSocket-compatible surface.
2. Leader-first correctness: One authoritative WS connection per scope (namespace).
3. Minimal coupling: Wire protocol-agnostic. Library only routes frames.
4. Simplicity: No reconnect/backoff; zero-queue (messages may drop if leader not ready).
5. Portability: Browser-first; no `SharedWorker`. MVP requires `BroadcastChannel` + `localStorage`.

---

## 3. Public API

### 3.1 Constructor

```ts
new BroadcastWebsocket(url: string, options?: Options)
```

Options (MVP):
```ts
type Options = {
  scope?: string;             // election namespace; defaults to URL origin
  protocols?: string | string[]; // WebSocket subprotocols
};
```

### 3.2 WebSocket Compatibility Surface (composite)

- Properties
  - `readyState`: `0|1|2|3`
  - `url`: `string`
  - `binaryType`: `'blob'|'arraybuffer'`
  - `protocol`: `string`
  - `extensions`: `string`
  - `bufferedAmount`: `number`
- Events
  - `open`, `message`, `error`, `close`
- Methods
  - `send(data)`
  - `close(code?, reason?)`
- Additional
  - `subscribe(handler)`
  - `on(event, handler)`
  - `status()`
  - Note: Class implements `WebSocket` interface (adds `addEventListener`, `removeEventListener`, `dispatchEvent`, `onopen`, etc.)

### 3.3 Library-Specific Events (MVP)

- None beyond WebSocket’s standard events. Followers emit synthetic `open`/`close` and `message` based on bus signals.

---

## 4. Behavior & Algorithms

### 4.1 Leader Election

- Implemented via `localStorage` key `bws:leader:<scope>` with timestamp heartbeats.
- Stale leadership expires after timeout; any follower may claim.
- One leader per scope; followers monitor `storage` events.

### 4.2 Connection Management

- Only leader opens native `WebSocket`.
- No reconnect/backoff in MVP.

### 4.3 Message Routing

- Follower → Leader → Server via `BroadcastChannel` (kind: `out`).
- Server → Leader → Followers broadcast via `BroadcastChannel` (kind: `in`).
- Followers also receive synthetic `open`/`close` (`sys` events) to mirror leader’s state.

### 4.4 Ordering, Duplication, Flow Control

- Ordering preserved per single socket on the leader.
- Zero-queue: follower sends before leader is ready may be dropped.

### 4.5 Fallback

- None in MVP. Requires `BroadcastChannel`.

### 4.6 Lifecycle

- Track subscriber counts.
- Optional grace TTL before closing socket.
- Clean up on disposal.

---

## 5. Security & Auth

- MVP does not include auth plumbing. Applications should embed auth in the URL or use server-side session.

---

## 6. Performance

- Messages are relayed directly; no buffering. BroadcastChannel adds small latency (ms-scale).

---

## 7. Compatibility

- Needs: `WebSocket`, `crypto.getRandomValues`, `BroadcastChannel`, and `localStorage`.
- Works: modern browsers and webviews that support these APIs.
- Caveat: Some embedders (e.g., certain OBS setups) may isolate BroadcastChannel across widgets.

---

## 8. Observability

- `status()` returns a basic snapshot: id, url, isLeader, leaderId, readyState, bufferedAmount.

---

## 9. Testing Strategy

- Unit: Mock `WebSocket` + `BroadcastChannel`.
- Integration: Playwright multi-tab.
- Fallback: storage-event path.
- Stress: bursts, teardown, GC leaks.

---

## 10. Packaging

- Outputs: ESM + CJS + `.d.ts`
- Bundler: `tsup` / `rollup`
- `package.json`: exports, types, sideEffects
- Tooling: ESLint, Prettier
- License: MIT/Apache-2.0

---

## 11. Documentation to Ship

- Quick start
- Behavioral contract
- Auth recipes
- Fallback caveats
- Performance tuning
- FAQ

---

## 12. Risks

- Broadcast isolation in some embedders.
- iOS throttling background tabs (heartbeats may delay).
- Storage-event delivery can be laggy.
- Zero-queue may drop early follower sends.

---

## 13. MVP Acceptance Criteria

- One leader per scope maintains a single native WS connection.
- Followers delegate `send()` to leader; inbound broadcasts reach all.
- Leader loss triggers takeover based on storage timeout.
- Works with `BroadcastChannel` (no fallback).

---

## 14. Deliverables Checklist

- BroadcastWebsocket class (WebSocket-compatible API)
- Simple leader election (localStorage)
- Message forwarding (BroadcastChannel)
- Zero-queue/no-reconnect MVP
- Demos (tabs + iframes) and local WS server
- Build config (tsup) and docs

---

## 15. Notes on WebSocket API Reuse

- Event model: `addEventListener`/`removeEventListener`, `onopen`, `onmessage`, etc.
- `bufferedAmount`: leader reflects native; followers reflect 0.
- `binaryType`: leader meaningful; followers mirror interface only.
- `protocol`/`extensions`: rebroadcast from leader.
- Deviation: follower `close()` does not close leader socket.
