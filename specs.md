# Shared WebSocket Transport — Package Specification (MVP)

> Status: MVP
>
> Goal: Provide a single, shared WebSocket transport per {url, scope} across multiple browser contexts (tabs, windows, embedded views). Exactly one context (“leader”) owns the real `WebSocket`; followers attach via `BroadcastChannel` and delegate sends.

---

## 1. Overview

- Problem: In multi-context environments, each context opens its own WebSocket to the same server, wasting connections.
- Solution: A `SharedWsTransport` class that:
  - Elects a leader context to hold the real `WebSocket`.
  - Followers delegate outbound frames to the leader via `BroadcastChannel`.
  - The leader rebroadcasts inbound messages and state updates to followers.
- Contract: One physical WebSocket per {url, scope}. Leader tab owns transport. Other tabs attach and delegate send; all tabs receive messages.

---

## 2. Design Principles

1. Explicit transport surface: no `WebSocket` interface parity or drop-in claims.
2. Leader-first correctness: one authoritative socket per scope.
3. Wire protocol-agnostic: only routes frames.
4. Simplicity: no reconnect/backoff; zero-queue.
5. Browser-first: `BroadcastChannel` + `localStorage` (no `SharedWorker`).

---

## 3. Public API

### 3.1 Constructor

```ts
new SharedWsTransport(url: string, options?: Partial<Options>)
```

Options (MVP):
```ts
type Options = {
  scope?: string;               // defaults to URL origin
  protocols?: string | string[];
  heartbeatMs?: number;
  timeoutMs?: number;
  debug?: boolean;
  logger?: (message: string, detail?: Record<string, unknown>) => void;
};
```

### 3.2 State

- `transportState`: `'connecting' | 'open' | 'closing' | 'closed'`
- `role`: `'leader' | 'follower'`

### 3.3 Methods

- `send(data)` — throws unless `transportState === 'open'`. Followers delegate to leader.
- `terminate(code?, reason?)` — request the leader to close the transport.
- `detach()` / `dispose()` — stop participating (remove listeners, stop election, close bus).
- `status()` → `{ id, role, leaderId, transportState, url, scope }`

### 3.4 Events

- `transport_open`
- `transport_close` → `{ code, reason, wasClean }`
- `transport_error` → `{ error?: unknown }`
- `message` → `{ data }`
- `role_change` → `{ role, leaderId }`

---

## 4. Behavior & Algorithms

### 4.1 Leader Election

- Implemented via `localStorage` key `shared-ws:leader:<scope>` with timestamp heartbeats.
- Stale leadership expires after timeout; any follower may claim.
- Followers observe `storage` events for handoff.

### 4.2 Connection Management

- Only the leader opens the native `WebSocket`.
- No reconnect/backoff in MVP.

### 4.3 Message Routing

- Follower → Leader → Server via `BroadcastChannel` (`OUT`).
- Server → Leader → Followers via `BroadcastChannel` (`IN`).
- Followers learn leader state through `STATE` updates.

### 4.4 Ordering & Flow Control

- Ordering preserved per single leader socket.
- Zero-queue: `send()` throws unless leader transport is open.

### 4.5 Late Joiners

- Followers send `JOIN` on startup.
- Leader replies with `STATE` (current `transportState`, `protocol`, `extensions` if open).

---

## 5. Bus Protocol (v1)

All bus messages are structured-clone-safe and include a version field.

```ts
type BusMessage =
  | { v: 1; kind: 'JOIN'; senderId: string }
  | { v: 1; kind: 'LEAVE'; senderId: string }
  | { v: 1; kind: 'STATE'; senderId: string; transportState: TransportState; protocol?: string; extensions?: string; close?: CloseDetail }
  | { v: 1; kind: 'IN'; senderId: string; data: BusPayload }
  | { v: 1; kind: 'OUT'; senderId: string; data: BusPayload; reqId?: string }
  | { v: 1; kind: 'TERMINATE'; senderId: string; code?: number; reason?: string; reqId?: string }
  | { v: 1; kind: 'ERROR'; senderId: string; message?: string };
```

---

## 6. Binary Strategy

- Bus payloads are standardized to `string | ArrayBuffer`.
- Leader WebSocket uses `binaryType = 'arraybuffer'`.
- If callers send `Blob`, it is converted to `ArrayBuffer` before posting `OUT`.

---

## 7. Observability

- `status()` returns `{ id, role, leaderId, transportState, url, scope }`.
- Optional debug logging via `debug` + `logger`.

---

## 8. Testing Strategy

- Unit: stub `WebSocket` and `BroadcastChannel`.
- Integration: Playwright multi-context (tabs/frames).
- Scenarios: leader ownership, follower send delegation, inbound broadcast, leader handoff, late joiner `STATE` sync.

---

## 9. Risks

- BroadcastChannel isolation in some embedders.
- Background throttling affects heartbeats.
- Zero-queue behavior drops early sends.

---

## 10. MVP Acceptance Criteria

- One leader per scope maintains a single native WebSocket connection.
- Followers delegate `send()` to leader; inbound messages reach all contexts.
- Leader loss triggers takeover based on storage timeout.
- Late joiners receive current `STATE` and begin receiving messages.
