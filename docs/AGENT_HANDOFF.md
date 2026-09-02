# Ariadne — Agent Handoff

## Current Milestone

**Prompt 10 — Deliberate Browser References for Re-entry**

## Status

✅ Minimal deliberate browser-reference code and documentation updates are complete.

## Ready for External Validation

**Code path validated in this sandbox.**

## Remaining Blockers

1. The browser-reference path has been validated only with compile, lint, and unit tests in this sandbox. Extension-host and external user validation still remain.

## What Was Completed

- Added a persisted `browserReferences` list to each Investigation for deliberate external page attachment.
- Kept references minimal: URL, optional title, and attach timestamp only.
- Added the `Ariadne: Attach Current Page to Ariadne` command, which prefers explicit selection from open HTTP(S) page candidates in VS Code tabs and falls back to manual URL entry.
- Rendered attached references textually inside the existing Resume Snapshot instead of creating a browser panel or dashboard.
- Kept references re-entry-only: they do not drive automatic reopening, do not capture page contents, and do not import browser history.
- Bumped storage schema to version 6 while keeping older saved investigations loadable; schema version 5 investigations load with an empty browser-reference list.
- Updated README, product baseline, architecture, decisions, and validation docs to make the deliberate-capture boundary explicit.
- Added unit and extension-test coverage for attachment, persistence, and Resume Snapshot rendering.

## Files Changed

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

## Tests / Verification

- `npm run compile` — succeeds
- `npm run lint` — succeeds
- `npm run test:unit` — succeeds

## Decisions Made This Session

- ADR-032: Deliberate Minimal Browser References Only

## What Remains

- Run extension-host validation for the attach command and Resume Snapshot reference rendering with real VS Code browser/page tabs.
- Run external validation focused on whether explicit minimal browser references materially improve Investigation re-entry before considering any broader browser integration.

## Next Recommended Action

**Run extension-host and user validation specifically against deliberate page attachment and Resume Snapshot reference usefulness before expanding browser integration beyond the current Investigation scope.**

## Do Not Touch / Deferred

- Do not add browser-history import, page-content capture, cloud sync, AI summarization, or broader browser-product features until the current deliberate reference flow is externally validated.
- Do not add exact workspace/session restore behavior.
- Do not redesign the architecture further unless a concrete defect requires it.
