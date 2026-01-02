# BroadcastWebsocket TODO Review

## Core behavior and API parity
- [ ] Honor `options.protocols` when creating the native WebSocket (currently ignored). (`src/BroadcastWebsocket.ts`)
- [ ] Implement or remove the spec-promised `subscribe()` and `on()` helpers. (`specs.md`, `src/BroadcastWebsocket.ts`)
- [ ] Sync follower state when joining after the leader is already OPEN (no late join handshake today). (`src/BroadcastWebsocket.ts`, `src/bus.ts`)
- [ ] Propagate leader `protocol` and `extensions` to followers on open. (`src/BroadcastWebsocket.ts`, `src/bus.ts`)
- [ ] Keep `binaryType` changes in sync with an already-open leader socket. (`src/BroadcastWebsocket.ts`)
- [ ] Resolve the undocumented `sent` event vs. spec claim of “no extra events.” (`specs.md`, `src/BroadcastWebsocket.ts`)
- [ ] Align `send()` behavior with WebSocket semantics for followers (currently drops silently). (`src/BroadcastWebsocket.ts`)
- [ ] Prevent closed followers from continuing to receive bus messages. (`src/BroadcastWebsocket.ts`)

## Error and close propagation
- [ ] Broadcast leader `error` events to followers (bus type exists but unused). (`src/BroadcastWebsocket.ts`, `src/bus.ts`)
- [ ] Include close details (`code`, `reason`, `wasClean`) in follower close events. (`src/BroadcastWebsocket.ts`, `src/bus.ts`)
- [ ] If `openSocket()` fails, transition to CLOSED and notify followers. (`src/BroadcastWebsocket.ts`)

## Leader election lifecycle
- [ ] Release leadership on `Election.stop()` to avoid stale leader entries. (`src/election.ts`)
- [ ] Track and remove the `beforeunload` listener on stop. (`src/election.ts`)
- [ ] Guard for missing `window`/`localStorage` to avoid SSR/runtime crashes. (`src/election.ts`)

## Tests and tooling
- [ ] Fix missing `test/setup.ts` referenced by Vitest config. (`vitest.config.ts`)
- [ ] Finish the leader failover test (no assertions today). (`src/BroadcastWebsocket.test.ts`)
- [ ] Normalize test locations per project guideline (`src/__tests__/`). (`src`, `test`)
- [ ] Update or remove stale comments in runtime compliance test. (`test/interface-compliance.test.ts`)

## Packaging and logging
- [ ] Move `ws` to `devDependencies` (demo server only). (`package.json`, `scripts/server.js`)
- [ ] Remove or gate the constructor `console.log` behind an option. (`src/BroadcastWebsocket.ts`)
