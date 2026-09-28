# Ariadne — Agent Handoff

> Historical VS Code-extension handoff. The current platform migration handoff is [`AGENT_HANDOFF_PLATFORM.md`](AGENT_HANDOFF_PLATFORM.md).

## Current Milestone

**Resume Brief — Human-authored work-thread context**

## Status

Resume Brief capture has been implemented in the working tree. It has not been verified in this turn.

## Ready for External Validation

The earlier browser-reference implementation had compile, lint, and unit-test validation. The current Resume Brief changes have not been verified.

## Remaining Blockers

1. Resume Brief behavior needs typecheck, lint, unit, and extension-host validation.
2. External validation should assess whether the guided note meaningfully improves re-entry without adding too much capture friction.

## What Was Completed

- Added an optional five-part Resume Brief for context/findings, decisions, key artifacts, open questions, and next step.
- Kept all brief content human-authored and local, using the existing checkpoint field so saved investigations need no schema migration.
- Kept older free-form checkpoint notes readable and editable.
- Updated the Resume Snapshot label and product documentation to reflect the Resume Brief and its explicit, non-inferential role.

## Earlier Browser Reference Work

- Added a persisted `browserReferences` list to each Investigation for deliberate external page attachment.
- Kept references minimal: URL, optional title, and attach timestamp only.
- Added the `Ariadne: Attach Current Page to Ariadne` command, which prefers explicit selection from open HTTP(S) page candidates in VS Code tabs and falls back to manual URL entry.
- Rendered attached references textually inside the existing Resume Snapshot instead of creating a browser panel or dashboard.
- Kept references re-entry-only: they do not drive automatic reopening, do not capture page contents, and do not import browser history.
- Bumped storage schema to version 6 while keeping older saved investigations loadable; schema version 5 investigations load with an empty browser-reference list.
- Updated README, product baseline, architecture, decisions, and validation docs to make the deliberate-capture boundary explicit.
- Added unit and extension-test coverage for attachment, persistence, and Resume Snapshot rendering.

## Earlier Browser Reference Files Changed

- `LICENSE`
- `README.md`
- `docs/AGENT_HANDOFF.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PRODUCT_BASELINE.md`
- `docs/VALIDATION.md`
- `src/commands/investigationLifecycle.ts`
- `src/commands/resumePlan.ts`
- `src/commands/registerInvestigationCommands.ts`
- `src/domain/index.ts`
- `src/domain/types.ts`
- `src/domain/investigation.ts`
- `src/test/investigationLifecycle.test.ts`
- `src/test/domain.test.ts`
- `src/test/resumeAction.test.ts`
- `src/test/resumeSnapshot.test.ts`
- `src/test/storage.test.ts`
- `src/storage/store.ts`
- `src/ui/resumeSnapshot.ts`

## Resume Brief Files Touched

- `README.md`
- `package.json`
- `docs/AGENT_HANDOFF.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PRODUCT.md`
- `docs/PRODUCT_BASELINE.md`
- `docs/VALIDATION.md`
- `src/commands/investigationLifecycle.ts`
- `src/commands/registerInvestigationCommands.ts`
- `src/test/investigationLifecycle.test.ts`
- `src/ui/resumeSnapshot.ts`

## Important Implementation Details

1. Browser references are persisted only inside one Investigation and only to improve re-entry.
2. Browser references are deliberately manual. Ariadne never imports browser history or page contents.
3. The command can show temporary open-page candidates only when VS Code exposes HTTP(S) tab URIs locally; otherwise it falls back to manual URL entry.
4. Attached references are not used for reopen planning. They exist only to improve human re-entry in the Resume Snapshot.
5. Duplicate attachments by URL are collapsed to one saved reference, refreshing the timestamp and preserving the existing title when a later attachment omits one.
6. `markInvestigationResumed` still persists a `resume.point` and `lastResumedAt` without updating `savedAt`, so re-entry markers do not reorder saved investigations.
7. Schema version 6 keeps schema version 5 saves loadable by defaulting `browserReferences` to an empty list.

## Known Issues

1. Browser-reference validation is still code-level only in this sandbox; no extension-host or external user evidence has been gathered yet.
2. Open-page candidate discovery depends on what VS Code exposes as local HTTP(S) tabs; it is intentionally best-effort, not a history integration.
3. The feature does not capture page contents, so usefulness depends on URL and title being enough to trigger re-entry.

## Earlier Tests / Verification

- `npm run compile` — succeeds
- `npm run lint` — succeeds
- `npm run test:unit` — succeeds

## Decisions Made This Session

- ADR-033: Guide Resume Notes with Human-Authored Sections
- ADR-032: Deliberate Minimal Browser References Only

## What Remains

- Verify the Resume Brief capture, edit, persistence, and legacy note behavior.
- Run extension-host validation for Resume Brief rendering and the existing attached-reference flow.
- Run external validation focused on whether brief fields and minimal external references materially improve re-entry before considering broader capture.

## Next Recommended Action

**Verify the Resume Brief changes, then run focused user validation on re-entry usefulness and capture friction.**

## Current platform implementation status

The Rust platform foundation is the authoritative direction. The older
Investigation lifecycle remains retained as migration compatibility; it is not
the canonical desktop state owner.

| Category | Current state |
|---|---|
| Implemented | Rust Thread/Core, SQLite storage, tombstones and generation/revision checks, persisted privacy policy and exclusions, deterministic active-thread reconciliation, authenticated OS-local adapter transport, Tauri lifecycle and Thread detail UI, bounded Resume actions, tray actions, bounded logs/Open Logs, reversible Windows Start at Login command, Windows foreground identity and idle transition observation, reconnecting VS Code adapter, retained legacy-directory startup import, tested browser adapter privacy boundary |
| Verified | PR #12 hosted Rust/VS Code/Windows workflow #38 passed, including Windows MSI/NSIS artifact upload; local targeted Rust tests/clippy/format and TypeScript/frontend checks passed; PR #13 finalization workflow is the current validation gate |
| Remaining | Native browser-extension/host registration and end-to-end browser-to-Core delivery; abrupt process termination/restart exercise; Windows runtime/manual UX validation; dynamic tray-state labels; queryable Start at Login setting; measured Windows performance; removal of legacy VS Code JSON compatibility after migration parity validation |
| Deferred | macOS/Linux sensors, Android companion, cloud/accounts/sync, AI/LLM/embeddings, telemetry, screenshots, clipboard/keystrokes, content capture, productivity scoring |
| Known failures | Full desktop Rust verification is not locally reproducible in the container because GTK/WebKit development libraries are unavailable; Windows runtime behavior and performance are not externally validated; PR #13 hosted result must be checked before calling this branch green |

The finalization branch must not be described as a complete end-user Windows
release until hosted PR #13 checks pass and Windows runtime/install/restart
validation has actual evidence.

## Do Not Touch / Deferred

- Do not add browser-history import, page-content capture, cloud sync, AI summarization, or broader browser-product features.
- Do not add exact workspace/session restore behavior.
- Do not redesign the architecture further unless a concrete defect requires it.
