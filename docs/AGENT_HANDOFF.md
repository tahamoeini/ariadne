# RepoTrail — Agent Handoff

## Current Milestone

**Prompt 8 — Optional Future Prompt: Timeline**

## Status

✅ Investigation-scoped timeline code and documentation updates are complete.

## Ready for External Validation

**Code path validated in this sandbox.**

## Remaining Blockers

1. The timeline has been validated only with compile, lint, and unit tests in this sandbox. Extension-host and external user validation still remain.

## What Was Completed

- Added a minimal persisted `timeline` to each Investigation for factual sequence reconstruction during re-entry.
- Kept the timeline investigation-scoped and rendered it inside the existing Resume Snapshot instead of creating a dashboard or new UI surface.
- Recorded only factual timeline entries: file transitions, collapsed consecutive edit events, checkpoint changes, Git snapshots, save points, and resume points.
- Added resume-time persistence so a factual resume point is captured without mutating the prior save timestamp.
- Bumped storage schema to version 4 and derived a best-effort timeline when loading older schema version 3 investigations.
- Updated README, product baseline, architecture, decisions, and validation docs to make the timeline boundary and validation gate explicit.
- Added unit coverage for timeline persistence, edit-noise collapsing, and resume-point capture.

## Files Changed

- `LICENSE`
- `README.md`
- `docs/AGENT_HANDOFF.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PRODUCT_BASELINE.md`
- `docs/VALIDATION.md`
- `src/commands/investigationLifecycle.ts`
- `src/commands/registerInvestigationCommands.ts`
- `src/domain/index.ts`
- `src/domain/types.ts`
- `src/domain/investigation.ts`
- `src/test/investigationLifecycle.test.ts`
- `src/test/domain.test.ts`
- `src/test/resumeSnapshot.test.ts`
- `src/test/storage.test.ts`
- `src/storage/store.ts`
- `src/ui/resumeSnapshot.ts`

## Important Implementation Details

1. The timeline is deliberately not a general activity log. It is persisted only inside one Investigation and only to improve re-entry.
2. Consecutive edit observations on the same file collapse into a single `file.edit` entry with a count, and repeated focus transitions to the same file are deduplicated.
3. Git snapshots are summarized into factual counts and branch/HEAD state for timeline rendering; the full Git snapshot still remains on the Investigation snapshot for saved-vs-current comparison.
4. `markInvestigationResumed` persists a `resume.point` and `lastResumedAt` without updating `savedAt`, so re-entry markers do not reorder saved investigations.
5. Schema version 4 loads schema version 3 saves and derives a best-effort timeline from saved path, checkpoint, Git snapshot, and last resumed timestamp when necessary.
6. Documentation now explicitly blocks graph work until the condensed timeline is validated as insufficient.

## Known Issues

1. Timeline validation is still code-level only in this sandbox; no extension-host or external user evidence has been gathered yet.
2. Older saved investigations can only receive a best-effort derived timeline because full raw event history was intentionally not persisted in earlier schemas.
3. Definition/reference navigation events remain intentionally deferred until they can be detected reliably through supported VS Code APIs.

## Tests / Verification

- `npm run compile` — succeeds
- `npm run lint` — succeeds
- `npm run test:unit` — succeeds (66 passing)

## Decisions Made This Session

- ADR-030: Add a Condensed Investigation-Scoped Timeline Before Any Graph

## What Remains

- Run extension-host validation for the updated Resume Snapshot and resume command behavior.
- Run external validation focused on whether the condensed timeline improves re-entry before considering any graph visualization.

## Next Recommended Action

**Run extension-host and user validation specifically against the new Resume Snapshot timeline, then decide whether the timeline is sufficient before adding any graph.**

## Do Not Touch / Deferred

- Do not add AI, graph visualization, timeline dashboards, or browser integration features until timeline validation shows a graph is necessary.
- Do not add exact workspace/session restore behavior.
- Do not redesign the architecture further unless a concrete defect requires it.
