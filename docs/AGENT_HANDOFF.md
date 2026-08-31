# RepoTrail — Agent Handoff

## Current Milestone

**Prompt 3 — Rolling Event Buffer**

## Status

✅ Complete

## What Has Been Built

### Prompt 1 (Scaffold)
- VS Code extension scaffold in TypeScript.
- `src/extension.ts` — entry point with `activate`/`deactivate` and a `repotrail.hello` command.
- Source directory stubs: `capture/`, `git/`, `commands/`, `ui/` (with `.gitkeep` files).
- `src/test/extension.test.ts` — integration tests verifying extension presence, command registration, and command execution.
- `.vscode-test.mjs` — test runner configuration using `@vscode/test-cli`.
- `eslint.config.mjs` — ESLint 9 flat config with `@typescript-eslint`.
- `.vscode/launch.json` and `.vscode/tasks.json` — debug/build configs.

### Prompt 2 (Domain & Persistence)
- **Domain types** (`src/domain/types.ts`): `Investigation`, `Checkpoint`, `Snapshot`, `GitSnapshot`, `ObservedEvent`, `ObservedEventType`, `FileLocation`.
- **Factory functions** (`src/domain/investigation.ts`): `createInvestigation()`, `createCheckpoint()`, `createEmptySnapshot()`.
- **Storage layer** (`src/storage/store.ts`): JSON-file CRUD — `saveInvestigation()`, `loadInvestigation()`, `listInvestigations()`, `deleteInvestigation()`. Schema-versioned envelope (v1).
- **Unit tests** (`src/test/domain.test.ts`, `src/test/storage.test.ts`): 23 tests covering creation, optional checkpoint, serialization round-trip, empty state, malformed/old data, deletion, update.
- **`npm run test:unit`** script for running domain/storage tests via Mocha without VS Code host.

### Prompt 3 (Rolling Event Buffer)
- **Rolling buffer** (`src/capture/eventBuffer.ts`): per-workspace rolling buffer with 20-minute default retention, safety max-event cap, chronological reads, and in-memory restart reset.
- **VS Code capture layer** (`src/capture/vscodeEventCapture.ts`): captures active editor changes, meaningful selection/location changes, and edit occurrence for file-backed workspace documents.
- **Event model update** (`src/domain/types.ts`): `ObservedEvent` now includes repository context and optional 1-based file location.
- **Extension wiring** (`src/extension.ts`): activates the capture layer and exposes a developer-only debug API through extension exports for inspecting/clearing recent events.
- **Tests** (`src/test/capture.test.ts`, `src/test/extension.test.ts`): cover retention, ordering, workspace/file transitions, edit occurrence, empty buffer, restart behavior, and noisy rapid transitions.

## Verified

- `npm run compile` — succeeds.
- `npm run lint` — passes.
- `npm run typecheck` — passes.
- `npm run test:unit` — 31 tests passing.
- `npm test` — added coverage for event capture, but could not be executed in this sandbox because `@vscode/test-cli` could not resolve `update.code.visualstudio.com`.

## What Remains

- **Prompt 4+:** Git adapter, snapshot assembly, UI, commands.

## Known Risks

1. **Git API choice not yet decided** — built-in Git extension API vs. CLI subprocess. Must be resolved during Prompt 4 or earlier.
2. **Definition/reference navigation is still deferred** — current VS Code APIs do not provide a reliable MVP signal for identifying those transitions without guesswork.
3. **Integration tests depend on VS Code download availability** — a cached or network-accessible VS Code build is needed for `npm test`.

## Decisions Made This Session

- ADR-012: JSON file storage via `globalStorageUri`.
- ADR-013: Schema version envelope.
- ADR-014: Plain interfaces, no classes.
- ADR-015: Mocha unit tests alongside VS Code integration tests.
- ADR-016: In-memory 20-minute rolling buffer.
- ADR-017: MVP capture limited to factual editor/location/edit events.
- ADR-018: Definition/reference navigation deferred until reliably detectable.

## Next Milestone

**Prompt 4 — Git Context and Snapshot Assembly**

Entry condition: Rolling buffer compiles, lints, and unit-tests cleanly (satisfied).
