# RepoTrail — Agent Handoff

## Current Milestone

**Prompt 4 — Git Context and Snapshot Assembly**

## Status

✅ Complete

## What Has Been Built

### Prompt 1 (Scaffold)
- VS Code extension scaffold in TypeScript.
- `src/extension.ts` — entry point with `activate`/`deactivate` and a `repotrail.hello` command.
- Source directory stubs: `capture/`, `git/`, `commands/`, `ui/`.
- `src/test/extension.test.ts` — integration tests verifying extension presence, command registration, and command execution.
- `.vscode-test.mjs` — test runner configuration using `@vscode/test-cli`.
- `eslint.config.mjs` — ESLint 9 flat config with `@typescript-eslint`.
- `.vscode/launch.json` and `.vscode/tasks.json` — debug/build configs.

### Prompt 2 (Domain & Persistence)
- **Domain types** (`src/domain/types.ts`): `Investigation`, `Checkpoint`, `Snapshot`, `GitSnapshot`, `ObservedEvent`, `ObservedEventType`, `FileLocation`.
- **Factory functions** (`src/domain/investigation.ts`): `createInvestigation()`, `createCheckpoint()`, `createEmptySnapshot()`.
- **Storage layer** (`src/storage/store.ts`): JSON-file CRUD — `saveInvestigation()`, `loadInvestigation()`, `listInvestigations()`, `deleteInvestigation()`.
- **Unit tests** (`src/test/domain.test.ts`, `src/test/storage.test.ts`) cover creation, optional checkpoint, serialization round-trip, empty state, malformed/old data, deletion, and update.

### Prompt 3 (Rolling Event Buffer)
- **Rolling buffer** (`src/capture/eventBuffer.ts`): per-workspace rolling buffer with 20-minute default retention, safety max-event cap, chronological reads, and in-memory restart reset.
- **VS Code capture layer** (`src/capture/vscodeEventCapture.ts`): captures active editor changes, meaningful selection/location changes, and edit occurrence for file-backed workspace documents.
- **Extension wiring** (`src/extension.ts`): activates the capture layer and exposes a developer-only debug API through extension exports for inspecting/clearing recent events.

### Prompt 4 (Git Snapshot)
- **Git adapter** (`src/git/snapshot.ts`, `src/git/index.ts`): captures lightweight local Git state with filesystem repo-root detection plus safe argv-based `git` CLI calls.
- **Domain model update** (`src/domain/types.ts`): `GitSnapshot` now records explicit availability, repository root, and nullable HEAD for no-commit repositories.
- **Storage migration** (`src/storage/store.ts`): current saves use schema version 2, and legacy schema version 1 Git snapshots are migrated on load.
- **Tests** (`src/test/git.test.ts`, updates in `src/test/domain.test.ts`, `src/test/storage.test.ts`): cover Git status parsing, diff-stat parsing, non-repo state, missing Git, detached HEAD, no commits, and legacy storage migration.
- **Unit test command** (`package.json`): `npm run test:unit` now includes the Git snapshot suite.

## Files Changed

- `docs/AGENT_HANDOFF.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `package.json`
- `src/domain/types.ts`
- `src/git/index.ts`
- `src/git/snapshot.ts`
- `src/storage/store.ts`
- `src/test/domain.test.ts`
- `src/test/git.test.ts`
- `src/test/storage.test.ts`

## Important Implementation Details

1. Repo root discovery walks upward for a `.git` directory/file before invoking Git, so RepoTrail can still return repository-aware `git-missing` states when the executable is unavailable.
2. Git CLI calls use fixed argument arrays (`git -C <repoRoot> ...`) rather than shell command strings, avoiding shell-command injection risks and preserving spaces/special characters in paths.
3. Changed-file lists come from `git status --porcelain=v1 --branch -z --untracked-files=all`, so file names are parsed as NUL-delimited repository-relative paths.
4. Diff stats use `git diff --shortstat HEAD --` when HEAD exists and combine staged + unstaged shortstats for unborn repositories.
5. The saved Git snapshot is the THEN state only. Resume flows should capture a fresh NOW snapshot later instead of mutating the persisted one.

## Known Issues

1. **Definition/reference navigation remains deferred** — current VS Code APIs still do not provide a reliable MVP signal without guesswork.
2. **Integration tests depend on VS Code download availability** — `npm test` may still fail in restricted environments if the VS Code test host cannot be downloaded.

## Tests / Verification

- `npm run compile` — succeeds.
- `npm run lint` — passes.
- `npm run typecheck` — passes.
- `npm run test:unit` — 42 tests passing.
- `npm test` — attempted, but `@vscode/test-cli` could not resolve `update.code.visualstudio.com` in this sandbox.

## Decisions Made This Session

- ADR-019: Git snapshots use the local Git CLI via safe argument lists.
- ADR-020: Git snapshot availability is explicit and saved state is immutable.

## What Remains

- **Prompt 5+:** Investigation save/resume lifecycle, commands, and user-facing snapshot presentation.

## Next Recommended Action

**Prompt 5 — Build Investigation Lifecycle**

Entry condition: Git snapshot support compiles, lints, and unit-tests cleanly (satisfied).

## Do Not Touch / Deferred

- Do not add Git analytics (blame, ownership, co-change, churn, hotspots, commit graphs).
- Do not add GitHub/GitLab or any remote repository operations.
- Do not add semantic interpretation or AI-derived Git summaries.
