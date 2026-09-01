# RepoTrail 0.0.1 Experiment Protocol

## Goal

Prepare controlled and natural-use validation without adding telemetry or new product features.

## Build under test

- Version: `0.0.1`
- Package: `repotrail-0.0.1.vsix`
- Platform: VS Code desktop

## Variant setup

Set **RepoTrail › Validation Mode** before the investigation starts.

| Variant | Setup | Notes |
|---|---|---|
| **A** | `checkpoint-only` | Ask the tester to add a checkpoint before stopping. |
| **B** | `checkpoint-git` | Ask the tester to add a checkpoint before stopping. |
| **C** | `standard` | Full RepoTrail capture. |
| **D** | `git-trail` | Checkpoint capture is disabled for that investigation. |
| **E** | Do not use RepoTrail | Ordinary VS Code + Git baseline. |

The selected mode is saved with each RepoTrail investigation so the Resume Snapshot stays aligned with the assigned variant.

## Session flow

1. assign one variant
2. install RepoTrail for variants A-D, or skip installation for variant E
3. have the tester work on a real investigation
4. have the tester save explicitly or retroactively
5. if the variant includes checkpoints, let the tester decide what to write without coaching the contents
6. stop the session
7. return after 24–72 hours
8. for variants A-D, open **RepoTrail: Show Resume Snapshot**
9. collect outcomes manually

## Manual vs automatic collection

### Must be collected manually

- participant/session identifier
- assigned variant
- repository or task under investigation
- interruption length
- resume start time
- time to first edit or first confident next step
- self-reported confidence
- self-reported usefulness
- observed friction, confusion, and failure modes
- whether the tester would use RepoTrail again

### Automatically available as local RepoTrail artifacts only

- saved timestamp
- investigation name
- selected validation mode for variants A-D
- optional checkpoint text when that mode allows it
- saved Git snapshot when that mode allows it
- saved trail fields when that mode allows them:
  - edited files
  - revisited files
  - last location
  - recent observed path

RepoTrail does not automatically collect outcome metrics, aggregate study results, or send telemetry.

## Recording method

Use a spreadsheet, note template, or facilitator log outside RepoTrail. Early validation should stay manual.

## Practical notes

- `git-trail` disables checkpoint capture and blocks checkpoint updates.
- `checkpoint-only` and `checkpoint-git` intentionally save less context, so **RepoTrail: Resume Investigation** may reopen fewer or no files.
- Use **RepoTrail: Show Resume Snapshot** as the primary re-entry step for study sessions.
- Do not add analytics, dashboards, or extra instrumentation for this phase.
