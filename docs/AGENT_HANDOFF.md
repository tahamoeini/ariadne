# RepoTrail — Agent Handoff

## Current Milestone

**Prompt 8 — Privacy, Data Control, and Failure Hardening**

## Status

✅ Complete

## What Has Been Built

### Prompts 1–7 remain in place
- VS Code extension scaffold, local-only investigation storage, in-memory rolling buffer, read-only Git snapshot capture, Investigation lifecycle commands, Resume Snapshot rendering, and conservative Resume actions remain intact.

### Prompt 8 (Privacy / Local Data Control / Failure Hardening)
- **Persisted-schema minimization** (`src/storage/store.ts`): schema version 3 now saves only re-entry-critical data, stores workspace file paths relatively when possible, persists only a short `recentPath` instead of full observed-event objects, and drops non-essential persisted fields such as `createdAt`, `lastResumedAt`, `checkpoint.createdAt`, event metadata, and duplicated Git repository-root storage.
- **Corruption-safe storage** (`src/storage/store.ts`): saves now use temp-file replacement with a transient `.bak` recovery copy, best-effort private filesystem permissions, strict envelope validation, and safe fallback loading so malformed files are skipped or recovered instead of breaking activation.
- **Activation hardening** (`src/commands/investigationLifecycle.ts`): malformed `workspaceState` active-id payloads are ignored safely, and mismatched saved-workspace entries are not restored as active investigations.
- **Local data controls** (`src/commands/registerInvestigationCommands.ts`, `src/commands/index.ts`, `src/extension.ts`, `src/capture/vscodeEventCapture.ts`, `src/ui/resumeSnapshotProvider.ts`, `package.json`): adds `RepoTrail: Delete All RepoTrail Data` and `RepoTrail: Show Local Storage Location`, clears in-memory activity during delete-all, and invalidates cached Resume Snapshots after one-item or full deletion.
- **Checkpoint hardening** (`src/commands/investigationLifecycle.ts`, `src/commands/registerInvestigationCommands.ts`): investigation names and checkpoint text now have explicit length limits, and checkpoint prompts warn that notes are stored locally in plain text.
- **Tests** (`src/test/storage.test.ts`, `src/test/investigationLifecycle.test.ts`, `src/test/extension.test.ts`): cover minimized schema persistence, relative-path rehydration, backup recovery, malformed restart state, delete-all behavior, storage-location command coverage, and oversized checkpoint rejection.

## Files Changed

- `README.md`
- `docs/AGENT_HANDOFF.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `package.json`
- `src/capture/vscodeEventCapture.ts`
- `src/commands/index.ts`
- `src/commands/investigationLifecycle.ts`
- `src/commands/registerInvestigationCommands.ts`
- `src/extension.ts`
- `src/storage/index.ts`
- `src/storage/store.ts`
- `src/test/extension.test.ts`
- `src/test/investigationLifecycle.test.ts`
- `src/test/storage.test.ts`
- `src/ui/resumeSnapshotProvider.ts`

## Important Implementation Details

1. RepoTrail still requires no account, makes no network requests, uses no analytics, and performs no repository upload; the privacy pass hardened the existing local-first implementation rather than adding security theater.
2. Saved Investigations remain plain local JSON by design. The real security model is: same-machine, same-user local storage plus best-effort filesystem permissions where the platform supports them.
3. RepoTrail now persists only the data needed to remember/reopen an Investigation: identity, workspace context, optional checkpoint text, reopen evidence, short recent path, and Git drift metadata.
4. Full observed-event objects remain in memory only. On load, the storage layer rehydrates a minimal runtime `recentEvents` trail from saved `recentPath` so existing Resume Snapshot rendering can stay simple.
5. Delete-all clears saved investigations, active-investigation restart state, in-memory recent activity, and cached virtual Resume Snapshot content.
6. Resume Snapshot documents already open in the editor are invalidated through the content provider when their backing Investigation is deleted.

## Known Issues

1. **Integration tests still depend on VS Code download availability** — `npm test` can still fail in restricted environments if `@vscode/test-cli` cannot reach `update.code.visualstudio.com`.
2. **Checkpoint text is intentionally plain local text** — this is the actual product model, so users must avoid placing secrets in checkpoints.
3. **`docs/PRODUCT_BASELINE.md` still duplicates `PROMPT_CHAIN.md`** — the authoritative product narrative is effectively captured in `README.md` plus the implementation docs until that documentation discrepancy is cleaned up later.

## Tests / Verification

- `npm install` — succeeds.
- `npm run compile` — succeeds.
- `npm run lint` — passes after the privacy hardening changes.
- `npm run test:unit` — 62 tests passing.
- `npm test` — not rerun here; previous runs remain subject to VS Code download/network availability in this sandbox.

## Decisions Made This Session

- ADR-025: Persist only re-entry-critical Investigation data.
- ADR-026: Use the actual local security model, not cosmetic encryption.

## What Remains

- **Prompt 9+:** MVP quality pass and final validation polish on top of the hardened privacy/local-data baseline.

## Next Recommended Action

**Prompt 9 — MVP Quality Pass**

Entry condition: RepoTrail’s persisted schema, delete controls, storage documentation, and corruption handling now match the local-first privacy promise (satisfied).

## Do Not Touch / Deferred

- Do not add cloud sync, analytics, or remote repository integrations.
- Do not add encryption theater around general Investigation metadata.
- Do not expand capture into terminal, clipboard, screenshots, or source-content logging.
- Do not add semantic interpretation or AI-derived summaries.
- Do not turn Resume into exact restore behavior.
