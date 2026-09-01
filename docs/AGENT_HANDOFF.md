# RepoTrail — Agent Handoff

## Current Milestone

Prepare RepoTrail 0.0.1 for controlled and natural-use validation.

## Build / Version

- Extension version: `0.0.1`
- Packaged build: `repotrail-0.0.1.vsix`
- Storage schema: `4`
- Validation setting: `repotrail.validationMode`

## Status

✅ Minimal validation support and tester-facing documentation are in place.

## Install Procedure

1. `npm install`
2. `npm run compile`
3. `npm run package`
4. In VS Code, run **Extensions: Install from VSIX...**
5. Select `repotrail-0.0.1.vsix`
6. If needed, set **RepoTrail › Validation Mode** before starting an investigation:
   - `standard`
   - `checkpoint-only`
   - `checkpoint-git`
   - `git-trail`

## Validation Readiness

Ready for controlled and natural-use validation from the packaged VSIX, with manual study recording. Extension-host smoke coverage still needs a network-enabled environment or a cached VS Code test binary.

## What Was Completed

- Added one validation setting that safely limits saved context for the early study variants.
- Persisted the selected validation mode with each investigation so the Resume Snapshot stays aligned with the assigned variant after resume.
- Omitted Git, trail, or checkpoint data from saved investigations and Resume Snapshot output when the assigned mode disables that data family.
- Disabled checkpoint capture for the Git + trail variant.
- Added `docs/TESTER_GUIDE.md` for participants.
- Added `docs/EXPERIMENT_PROTOCOL.md` for facilitators.
- Updated this handoff with build, install, limitation, and readiness details.

## Files Changed

- `docs/AGENT_HANDOFF.md`
- `docs/EXPERIMENT_PROTOCOL.md`
- `docs/TESTER_GUIDE.md`
- `package.json`
- `src/commands/investigationLifecycle.ts`
- `src/commands/registerInvestigationCommands.ts`
- `src/domain/investigation.ts`
- `src/domain/types.ts`
- `src/extension.ts`
- `src/storage/store.ts`
- `src/test/domain.test.ts`
- `src/test/investigationLifecycle.test.ts`
- `src/test/resumeSnapshot.test.ts`
- `src/test/storage.test.ts`
- `src/ui/resumeSnapshot.ts`
- `src/ui/resumeSnapshotProvider.ts`
- `src/validation/captureProfile.ts`
- `src/validation/index.ts`

## Known Limitations

1. `npm test` still depends on a VS Code test binary that must be cached locally or downloadable from `update.code.visualstudio.com`; this sandbox cannot confirm that path.
2. Definition/reference navigation capture remains deferred until a reliable supported VS Code API path exists.
3. RepoTrail still does not promise exact restore of tabs, layout, terminals, or mental state.
4. `checkpoint-only` and `checkpoint-git` intentionally omit trail data, so **RepoTrail: Resume Investigation** may reopen fewer or no files.
5. Variant E is manual baseline use of ordinary VS Code + Git, so it is outside RepoTrail configuration.

## Tests / Verification

- `npm install` — succeeds
- `npm run compile` — succeeds
- `npm run lint` — succeeds
- `npm run typecheck` — succeeds
- `npm run test:unit` — succeeds (72 passing)
- `npm run package` — succeeds and produces `repotrail-0.0.1.vsix`
- `npm test` — fails in this sandbox with `getaddrinfo ENOTFOUND update.code.visualstudio.com`

## What Remains

- Run the extension-host smoke test where a VS Code test binary is available.
- Distribute the packaged VSIX to testers.
- Start controlled and natural-use validation with manual study logging.

## Next Recommended Action

**Package the VSIX, run `npm test` in a network-enabled environment, and begin validation using `docs/TESTER_GUIDE.md` and `docs/EXPERIMENT_PROTOCOL.md`.**
