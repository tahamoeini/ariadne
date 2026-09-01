# RepoTrail — Agent Handoff

## Current Milestone

**Prompt 7 — Implement Resume Actions**

## Status

✅ Complete

## What Has Been Built

### Prompt 1–5 Foundations
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

### Prompt 6 (Resume Snapshot)
- **Resume Snapshot renderer** (`src/ui/resumeSnapshot.ts`): produces a concise, factual Snapshot view from a saved Investigation plus a fresh current Git snapshot, with explicit handling for missing checkpoint, missing Git data, deleted/moved files, and missing/corrupted Investigation payloads.
- **VS Code-native Snapshot surface** (`src/ui/resumeSnapshotProvider.ts`, `src/ui/index.ts`): registers a read-only virtual Markdown document provider so a developer can open a saved Investigation into a Resume Snapshot without a webview.
- **Command wiring** (`src/commands/registerInvestigationCommands.ts`, `src/commands/index.ts`, `src/extension.ts`, `package.json`): adds `RepoTrail: Open Resume Snapshot` and makes `RepoTrail: List Saved Investigations` open the selected Investigation’s Resume Snapshot.
- **Tests** (`src/test/resumeSnapshot.test.ts`, `src/test/extension.test.ts`, `package.json`): cover rendering order, empty/unavailable states, missing Investigation handling, command registration, and opening a Snapshot document for a saved Investigation.

### Prompt 7 (Resume Actions)
- **Conservative reopen planning** (`src/commands/resumePlan.ts`): derives a small factual reopen plan from the saved Investigation, using only last saved file/location, edited files, revisited-file counts, workspace availability, and a hard reopen cap of 5 files.
- **Resume command wiring** (`src/commands/registerInvestigationCommands.ts`, `src/commands/index.ts`, `package.json`): adds `RepoTrail: Resume Investigation`, opens the Resume Snapshot first, then reopens the planned files, returns to the saved location when possible, and reports partial recovery without failing on missing files or workspace drift.
- **Stale-location handling** (`src/commands/registerInvestigationCommands.ts`): clamps the saved line/column to the current document bounds so moved or shortened files still reopen safely.
- **Tests** (`src/test/resumeAction.test.ts`, `src/test/extension.test.ts`, `package.json`): cover no-Git resume planning, changed workspace, large Investigation caps, successful resume, missing file recovery, and stale saved locations.

## Files Changed

- `README.md`
- `docs/AGENT_HANDOFF.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `package.json`
- `src/commands/index.ts`
- `src/commands/resumePlan.ts`
- `src/commands/registerInvestigationCommands.ts`
- `src/test/resumeAction.test.ts`
- `src/test/extension.test.ts`

## Important Implementation Details

1. Resume Snapshot content is intentionally factual and compact: no AI summary, importance scoring, semantic explanations, timelines, or graphs were added.
2. The Snapshot is rendered into a virtual Markdown document, not a custom webview, to keep the first re-entry surface simple and VS Code-native.
3. The Snapshot captures THEN vs NOW by comparing the saved `snapshot.git` state against a fresh current Git snapshot taken when the Snapshot document is opened.
4. Missing data is rendered explicitly: absent checkpoints are omitted, missing Git state is stated plainly, saved files that no longer exist are labeled as missing/deleted-or-moved, and missing/corrupted Investigation payloads render a dedicated unavailable message.
5. `RepoTrail: List Saved Investigations` remains the selection entry point and now opens the selected Investigation’s Resume Snapshot, while `RepoTrail: Open Resume Snapshot` offers a direct dedicated command.
6. `RepoTrail: Resume Investigation` is intentionally a **reopen** flow, not a restore flow: it opens the Resume Snapshot first, then reopens at most 5 files based on factual evidence only (last file/location, edited files, revisited counts), and finishes on the last saved file when it still exists.
7. Resume is partial by design: missing files, stale line/column data, workspace drift, repository drift, and no-Git states do not fail the command; the action reports what reopened and what was skipped.

## Known Issues

1. **Definition/reference navigation remains deferred** — current VS Code APIs still do not provide a reliable MVP signal without guesswork.
2. **Integration tests depend on VS Code download availability** — `npm test` still fails in restricted environments if the VS Code test host cannot be downloaded.
3. **Corrupted Investigation files are skipped in saved-Investigation lists** — the dedicated unavailable Snapshot state mainly covers direct open-by-id cases or investigations deleted after selection.
4. **`docs/PRODUCT_BASELINE.md` currently duplicates `PROMPT_CHAIN.md`** — the product-baseline narrative is effectively represented in `README.md` and the milestone prompts until that documentation discrepancy is cleaned up in a later doc-focused pass.
5. **Resume does not auto-switch workspaces/windows** — if the saved workspace path exists but is not currently open, RepoTrail reopens whatever saved files still exist and reports the mismatch instead of forcing a folder change.

## Tests / Verification

- `npm install` — succeeds.
- `npm run compile` — succeeds.
- `npm run lint` — passes.
- `npm run typecheck` — passes.
- `npm run test:unit` — 54 tests passing.
- `npm test` — attempted, but `@vscode/test-cli` could not resolve `update.code.visualstudio.com` in this sandbox.

## Decisions Made This Session

- ADR-021: One active Investigation per workspace.
- ADR-022: Pin File remains deferred until passive evidence proves insufficient.
- ADR-023: Resume Snapshot uses a read-only VS Code virtual document.
- ADR-024: Resume uses conservative reopen, not restore.

## What Remains

- **Prompt 8+:** Harden privacy, local data control, and failure handling on top of the working resume flow.

## Next Recommended Action

**Prompt 8 — Privacy, Data Control, and Failure Hardening**

Entry condition: A developer can select a saved Investigation, inspect the Resume Snapshot, and conservatively reopen saved context without restore promises (satisfied).

## Do Not Touch / Deferred

- Do not add Pin File UI/state unless evidence shows passive capture is insufficient.
- Do not add Git analytics (blame, ownership, co-change, churn, hotspots, commit graphs).
- Do not add GitHub/GitLab or any remote repository operations.
- Do not add semantic interpretation or AI-derived summaries.
- Do not add aggressive restore behavior; resume actions must stay conservative and factual.
- Do not auto-infer "important" files from semantics; resume priority must stay grounded in recorded evidence only.
