# RepoTrail — Agent Handoff

## Current Milestone

**Prompt 9 — Investigation-Scoped Navigation Graph**

## Status

✅ Investigation-scoped navigation-graph code and documentation updates are complete.

## Ready for External Validation

**Code path validated in this sandbox.**

## Remaining Blockers

1. The navigation graph has been validated only with compile, lint, and unit tests in this sandbox. Extension-host and external user validation still remain.

## What Was Completed

- Added a persisted `navigationGraph` to each Investigation as a collapsed spatial summary of observed Investigation movement.
- Kept the graph investigation-scoped and rendered it textually inside the existing Resume Snapshot instead of creating a graph UI or dashboard.
- Recorded only factual graph structure: observed file artifacts as nodes, observed transitions or supported navigation relationships as edges, plus collapsed counts and last-observed timestamps.
- Used the graph to improve Resume reopen ordering by prioritizing graph-adjacent artifacts before broader visit-count noise.
- Kept the existing timeline and resume-point persistence intact so sequence and resume markers still remain available.
- Bumped storage schema to version 5 and derived a best-effort navigation graph when loading older schema version 3 and 4 investigations.
- Updated README, product baseline, architecture, decisions, and validation docs to make the graph boundary and validation gate explicit.
- Added unit coverage for graph persistence, graph-based Resume usefulness, and lifecycle accumulation.

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

1. The navigation graph is deliberately not a repository map. It is persisted only inside one Investigation and only to improve re-entry.
2. Nodes currently represent observed file artifacts only. Edges represent factual observed transitions or supported navigation relationships only.
3. Noise is collapsed aggressively: repeated focus on the same current file does not create new graph structure, and repeated relationships collapse into counted edges.
4. Resume now uses the saved anchor file plus graph-adjacent artifacts before falling back to edited files and broader visit-count evidence.
5. `markInvestigationResumed` still persists a `resume.point` and `lastResumedAt` without updating `savedAt`, so re-entry markers do not reorder saved investigations.
6. Schema version 5 loads schema version 3 saves by deriving both timeline and graph from the reduced saved evidence, and loads schema version 4 saves by deriving the graph from the persisted timeline when needed.
7. Documentation now explicitly blocks graph visualization, repo-wide graph work, and richer inferred relationships until the current Resume-focused graph is externally validated.

## Known Issues

1. Navigation-graph validation is still code-level only in this sandbox; no extension-host or external user evidence has been gathered yet.
2. Older saved investigations can only receive a best-effort derived graph because full raw event history was intentionally not persisted in earlier schemas.
3. Definition/reference navigation edges remain available in the model but are still deferred in capture until they can be detected reliably through supported VS Code APIs.

## Tests / Verification

- `npm run compile` — succeeds
- `npm run lint` — succeeds
- `npm run test:unit` — succeeds

## Decisions Made This Session

- ADR-031: Add an Investigation-Scoped Navigation Graph for Resume

## What Remains

- Run extension-host validation for the updated Resume Snapshot and graph-guided resume command behavior.
- Run external validation focused on whether the current Investigation-scoped graph improves re-entry before considering any graph visualization or richer graph functionality.

## Next Recommended Action

**Run extension-host and user validation specifically against graph-guided Resume ordering and the textual Resume Snapshot graph before expanding the graph beyond the current Investigation scope.**

## Do Not Touch / Deferred

- Do not add AI, graph visualization, repository-wide dependency graphs, timeline dashboards, or browser integration features until the current Resume-focused graph is externally validated.
- Do not add exact workspace/session restore behavior.
- Do not redesign the architecture further unless a concrete defect requires it.
