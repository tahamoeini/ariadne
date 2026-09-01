# RepoTrail — Agent Handoff

## Current Milestone

**Prompt 5 — Build Investigation Lifecycle**

## Status

✅ Complete

## What Has Been Built

### Prompt 1–4 Foundations
- VS Code extension scaffold, domain model, JSON persistence, rolling buffer, and read-only Git snapshot capture remain in place from the previous milestone.

### Prompt 5 (Investigation Lifecycle)
- **Lifecycle service** (`src/commands/investigationLifecycle.ts`): manages one active Investigation per workspace, assembles snapshots from buffered observed events + current Git state + last location, accumulates live visit/edit evidence while active, restores active ids from `workspaceState`, and supports start/retroactive-create/checkpoint/save-stop/list/delete flows.
- **Command Palette wiring** (`src/commands/registerInvestigationCommands.ts`, `src/commands/index.ts`, `src/extension.ts`, `package.json`): adds `RepoTrail` commands for:
  - Start Investigation
  - Save Recent Activity as Investigation
  - Add or Update Checkpoint
  - Save and Stop Investigation
  - List Saved Investigations
  - Delete Investigation
- **Capture adapter update** (`src/capture/vscodeEventCapture.ts`, `src/capture/index.ts`): exposes current recent events, last known location, and an observed-event stream so the lifecycle service can append factual evidence while an Investigation stays active.
- **Storage update** (`src/storage/store.ts`): `saveInvestigation()` now returns the persisted Investigation object with the updated `savedAt` value so the lifecycle service can keep in-memory active state aligned with disk.
- **Tests** (`src/test/investigationLifecycle.test.ts`, `src/test/extension.test.ts`, `package.json`): cover explicit creation, retroactive creation, empty rolling buffer, checkpoint present/absent, no Git repository, persistence after extension restart, deletion, command registration, and command-driven lifecycle flow.

## Files Changed

- `README.md`
- `docs/AGENT_HANDOFF.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `package.json`
- `src/capture/index.ts`
- `src/capture/vscodeEventCapture.ts`
- `src/commands/index.ts`
- `src/commands/investigationLifecycle.ts`
- `src/commands/registerInvestigationCommands.ts`
- `src/extension.ts`
- `src/storage/store.ts`
- `src/test/extension.test.ts`
- `src/test/investigationLifecycle.test.ts`

## Important Implementation Details

1. Investigation creation always captures the current rolling-buffer events for the chosen workspace, derives factual visit counts from visit-like events (`editor.active`, `navigation.definition`, `navigation.reference`), derives edited files from factual `file.edit` events, captures the last known location, and attaches a fresh Git snapshot.
2. An active Investigation is kept in memory and updated from the observed-event stream, so later save/stop operations retain visit/edit evidence beyond the rolling buffer’s 20-minute retention window without requiring manual curation.
3. Only the active Investigation id is persisted in `workspaceState`; the durable Investigation payload remains the same schema-2 JSON file in global storage.
4. Checkpoint updates persist immediately and refresh the saved Git snapshot, but they do not introduce extra lifecycle states beyond “active” and “saved/stopped”.
5. Retroactive creation aborts cleanly when the rolling buffer is empty instead of creating a low-signal Investigation.

## Known Issues

1. **Definition/reference navigation remains deferred** — current VS Code APIs still do not provide a reliable MVP signal without guesswork.
2. **Integration tests depend on VS Code download availability** — `npm test` still fails in restricted environments if the VS Code test host cannot be downloaded.
3. **`docs/PRODUCT_BASELINE.md` currently duplicates `PROMPT_CHAIN.md`** — the product-baseline narrative is effectively represented in `README.md` and the milestone prompts until that documentation discrepancy is cleaned up in a later doc-focused pass.

## Tests / Verification

- `npm install` — succeeds.
- `npm run compile` — succeeds.
- `npm run lint` — passes.
- `npm run typecheck` — passes.
- `npm run test:unit` — 48 tests passing.
- `npm test` — attempted, but `@vscode/test-cli` could not resolve `update.code.visualstudio.com` in this sandbox.

## Decisions Made This Session

- ADR-021: One active Investigation per workspace.
- ADR-022: Pin File remains deferred until passive evidence proves insufficient.

## What Remains

- **Prompt 6+:** Build the Resume Snapshot and later resume actions on top of the saved Investigation lifecycle.

## Next Recommended Action

**Prompt 6 — Build the Resume Snapshot**

Entry condition: Investigation lifecycle commands work end-to-end, unit validation passes, and the product now has durable saved Investigations to display (satisfied).

## Do Not Touch / Deferred

- Do not add Pin File UI/state unless evidence shows passive capture is insufficient.
- Do not add Git analytics (blame, ownership, co-change, churn, hotspots, commit graphs).
- Do not add GitHub/GitLab or any remote repository operations.
- Do not add semantic interpretation or AI-derived summaries.
- Do not build the final resume webview/UI in this milestone.
