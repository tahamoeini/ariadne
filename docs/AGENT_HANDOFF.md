# RepoTrail — Agent Handoff

## Current Milestone

**Prompt 9 — RepoTrail 0.0.1 Quality Pass**

## Status

⚠️ Quality-pass code and documentation updates are complete, but the required extension-host smoke test could not finish in this sandbox.

## Ready for External Validation

**Not yet confirmed from this sandbox.**

## Remaining Blockers

1. `npm test` could not run to completion because `@vscode/test-cli` could not resolve `update.code.visualstudio.com`, and no local VS Code test binary was available to reuse.

## What Was Completed

- Added startup activation with `onStartupFinished` so the rolling buffer exists before the first RepoTrail command.
- Persisted active investigations during extension shutdown so normal close/reload preserves the latest active snapshot state.
- Guarded `saveAndStopInvestigation` so a workspace-state persistence failure keeps the investigation active instead of silently clearing it in memory.
- Aligned capture-layer repository detection with the Git adapter so nested workspace folders can still report their repository root.
- Reused one Resume Snapshot virtual document per investigation and refreshed it in place to avoid duplicate snapshot tabs and stale cached content.
- Removed the placeholder `repotrail.hello` command.
- Tightened command/result wording to better reflect actual behavior.
- Replaced the duplicated `docs/PRODUCT_BASELINE.md` stub with an actual product baseline and updated README and implementation docs to match the shipped 0.0.1 behavior.
- Added clean packaging metadata (`repository`) and a `LICENSE` file so `vsce package` completes without the earlier warnings.
- Added tests for startup activation, Resume Snapshot refresh reuse, active-investigation persistence, and stop rollback behavior.

## Files Changed

- `LICENSE`
- `README.md`
- `docs/AGENT_HANDOFF.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PRODUCT_BASELINE.md`
- `docs/VALIDATION.md`
- `package.json`
- `src/capture/vscodeEventCapture.ts`
- `src/commands/investigationLifecycle.ts`
- `src/commands/registerInvestigationCommands.ts`
- `src/commands/resumePlan.ts`
- `src/domain/types.ts`
- `src/extension.ts`
- `src/test/extension.test.ts`
- `src/test/investigationLifecycle.test.ts`
- `src/test/storage.test.ts`
- `src/ui/resumeSnapshotProvider.ts`

## Important Implementation Details

1. Retroactive capture now depends on startup activation rather than first-command activation, which restores the intended rolling-buffer behavior for `Save Recent Activity as Investigation`.
2. Active investigations are still saved immediately on creation, but shutdown now refreshes their last location, edited files, recent path, and Git snapshot before the extension exits.
3. Resume Snapshot documents now use a stable per-investigation URI, so reopening the same investigation updates the existing tab instead of generating one tab per save timestamp.
4. `README.md`, `docs/PRODUCT_BASELINE.md`, `docs/ARCHITECTURE.md`, and `docs/VALIDATION.md` now describe the actual 0.0.1 command set and no longer imply unimplemented 0.0.1 behavior such as Pin File support or definition/reference capture in the current build.

## Known Issues

1. The extension-host smoke test still depends on a VS Code binary that is either cached locally or downloadable by `@vscode/test-cli`; this sandbox had neither.
2. Definition/reference navigation events remain intentionally deferred until they can be detected reliably through supported VS Code APIs.

## Tests / Verification

- `npm install` — succeeds
- `npm run compile` — succeeds
- `npm run lint` — succeeds
- `npm run typecheck` — succeeds
- `npm run test:unit` — succeeds (64 passing)
- `npm run package` — succeeds and produces `repotrail-0.0.1.vsix`
- `npm test` — attempted, but failed because `update.code.visualstudio.com` could not be resolved in this sandbox

## Decisions Made This Session

- ADR-027: Activate on Startup So Retroactive Capture Works
- ADR-028: Persist Active Investigations on Shutdown
- ADR-029: Reuse One Resume Snapshot Document per Investigation

## What Remains

- Run the extension-host smoke test in an environment with network access to the VS Code download endpoint or with a cached VS Code test binary.
- If that passes, begin external validation for RepoTrail 0.0.1.

## Next Recommended Action

**Run `npm test` (or the equivalent extension-host smoke test) in a network-enabled environment, then start external validation if it passes.**

## Do Not Touch / Deferred

- Do not add AI, graph, timeline dashboard, or browser integration features.
- Do not add exact workspace/session restore behavior.
- Do not redesign the architecture further unless a concrete defect requires it.
