# Testing Setup Walkthrough

I have successfully set up a testing environment for `broadcast-websocket` using Vitest and HappyDOM.

## Changes

### 1. Dependencies
Installed `vitest`, `happy-dom`, and `@vitest/coverage-v8`.

### 2. Configuration
Created `vitest.config.ts` to configure the test environment and coverage.
Updated `package.json` with `test` and `test:coverage` scripts.

### 3. Test Setup
Created `test/setup.ts` to:
- Polyfill `BroadcastChannel` and `WebSocket` for Node environment.
- *Note: Tests now spawn the existing `scripts/server.js` as a child process to provide a real WebSocket server.*

### 4. Unit Tests
Created `src/BroadcastWebsocket.test.ts` covering:
- Initialization.
- Leader election (simulating multiple contexts via localStorage).
- WebSocket connection (mocked).

## Verification Results

### Test Execution
Ran `npm test` and `npm run test:coverage`.

```
 Test Files  1 passed (1)
      Tests  4 passed (4)
   Coverage  59.91% Statements
```

### Coverage
| File | % Stmts | % Branch | % Funcs |
|---|---|---|---|
| BroadcastWebsocket.ts | 50.4 | 22.41 | 57.14 |
| election.ts | 78.33 | 70.27 | 54.54 |

## Next Steps
- Add more tests to cover edge cases and message passing.
- Consider integration tests with a real WebSocket server if needed.
