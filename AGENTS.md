# Repository Guidelines

## Project Structure & Module Organization
TypeScript sources live in `src/`, with the production entry in `src/index.ts` and the main class in `src/BroadcastWebsocket.ts`. Support modules, such as leader election (`src/election.ts`) and the BroadcastChannel bus (`src/bus.ts`), stay colocated. Demo helpers sit in `src/scripts/demo.ts`, and compiled artifacts land in `dist/` after a build. HTML demos under `demo/` exercise multi-context scenarios, while `specs.md` captures design intent that should stay authoritative when changes are proposed.

## Build, Test, and Development Commands
Run `npm run build` to generate ESM, CJS, and type outputs via tsup; it cleans `dist/` first, so use it before publishing. Use `npm run dev` for a watch build while iterating on the library, and `npm run clean` to remove generated files. The demo server starts with `npm run demo:server`, listening on `ws://localhost:8787`—pair it with a static file server to validate handshake and broadcast behavior manually.

## Coding Style & Naming Conventions
Code is written in strict TypeScript targeting ES2020 (`tsconfig.json`), so keep new modules inside `src/`. Follow the existing two-space indentation and default ESM imports. Classes stay `PascalCase`, functions and variables `camelCase`, and types or interfaces end in descriptive nouns (`StatusSnapshot`). Prefer pure helpers in `utils.ts` and keep side effects inside constructor blocks or dedicated functions. Run your editor’s TypeScript formatter or `tsc --noEmit` to catch type regressions early.

## Testing Guidelines
There is no automated harness yet; when adding one, prefer lightweight unit tests that stub `WebSocket` and `BroadcastChannel`, and co-locate them under a new `src/__tests__/` folder. Until then, document manual reproduction steps in pull requests and exercise both leader and follower flows using the demo suite. Cover edge cases called out in `specs.md`, such as leadership handoff and dropped follower sends.

## Commit & Pull Request Guidelines
Write commits in the imperative mood with concise scope hints (e.g., `bus: normalize channel names`). Group unrelated changes into separate commits. Pull requests should include a short problem statement, a summary of the approach, notes on testing (commands run or demos exercised), and any follow-up TODOs. Link to relevant sections of `specs.md` when altering behavior, and attach screenshots or console logs if they clarify leader/follower timing.
