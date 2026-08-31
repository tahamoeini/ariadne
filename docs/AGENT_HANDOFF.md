# RepoTrail — Agent Handoff

## Current Milestone

**Prompt 2 — Core Domain Model and Local Persistence**

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

## Verified

- `npm run compile` — succeeds.
- `npm run lint` — passes.
- `npm run typecheck` — passes.
- `npm run test:unit` — 23 tests passing.

## What Remains

- **Prompt 3:** Implement rolling event buffer.
- **Prompt 4+:** Git adapter, snapshot assembly, UI, commands.

## Known Risks

1. **Git API choice not yet decided** — built-in Git extension API vs. CLI subprocess. Must be resolved during Prompt 4 or earlier.
2. **Rolling buffer persistence** — in-memory only vs. persisted across restarts. Must be resolved during Prompt 3.

## Decisions Made This Session

- ADR-012: JSON file storage via `globalStorageUri`.
- ADR-013: Schema version envelope.
- ADR-014: Plain interfaces, no classes.
- ADR-015: Mocha unit tests alongside VS Code integration tests.

## Next Milestone

**Prompt 3 — Rolling Event Buffer**

Entry condition: Domain model and persistence tests pass (satisfied).
