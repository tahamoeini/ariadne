# RepoTrail — Agent Handoff

## Current Milestone

**Prompt 1 — Scaffold the VS Code Extension**

## Status

✅ Complete

## What Has Been Built

- VS Code extension scaffold in TypeScript.
- `src/extension.ts` — entry point with `activate`/`deactivate` and a `repotrail.hello` command.
- Source directory stubs: `domain/`, `capture/`, `git/`, `storage/`, `commands/`, `ui/` (with `.gitkeep` files).
- `src/test/extension.test.ts` — integration tests verifying extension presence, command registration, and command execution.
- `.vscode-test.mjs` — test runner configuration using `@vscode/test-cli`.
- `eslint.config.mjs` — ESLint 9 flat config with `@typescript-eslint`.
- `.vscode/launch.json` and `.vscode/tasks.json` — debug/build configs.
- `.vscodeignore` — packaging exclusions.
- `.gitignore` — `out/`, `node_modules/`, `.vscode-test/`, `*.vsix`.
- Developer documentation in README (setup, commands, local run, tests).
- `package.json` with all scripts: `compile`, `watch`, `lint`, `typecheck`, `test`, `package`.

## Verified

- `npm run compile` — succeeds, emits to `out/`.
- `npm run lint` — passes with no warnings/errors.
- `npm run typecheck` — passes.
- Extension activates and registers `repotrail.hello` command.

## What Remains

- **Prompt 2:** Implement core domain model and local persistence.
- **Prompt 3:** Implement rolling event buffer.
- **Prompt 4+:** Git adapter, snapshot assembly, UI, validation.

## Known Risks

1. **Storage mechanism not yet decided** — `globalState` vs. JSON files vs. `globalStorageUri`. Must be resolved during Prompt 2.
2. **Git API choice not yet decided** — built-in Git extension API vs. CLI subprocess. Must be resolved during Prompt 4 or earlier.
3. **Rolling buffer persistence** — in-memory only vs. persisted across restarts. Must be resolved during Prompt 3.

## Decisions Made This Session

- ADR-009: TypeScript with ESLint flat config.
- ADR-010: @vscode/test-cli for testing.
- ADR-011: VS Code engine ^1.100.0.

## Next Milestone

**Prompt 2 — Core Domain Model and Local Persistence**

Entry condition: Extension scaffold compiles, lints, and tests pass (satisfied).
