# RepoTrail

> Pick up a code investigation where you left it.

RepoTrail is a local-first VS Code extension that preserves factual investigation context so a developer can reopen interrupted work later without reconstructing it from memory, tabs, and Git state alone.

## RepoTrail 0.0.1

RepoTrail 0.0.1:

- activates on VS Code startup and keeps a per-workspace rolling buffer of the last 20 minutes of observed activity
- lets you save the current investigation explicitly or retroactively save recent activity as an investigation
- keeps one active investigation per workspace and refreshes its saved state on checkpoint, stop, and extension shutdown
- stores only local JSON data needed for re-entry
- shows a read-only Resume Snapshot
- resumes by reopening up to 5 saved files and moving to the last saved location when that file still exists

## Commands

| Command | What it does |
|---|---|
| `RepoTrail: Start Investigation` | Saves the current workspace context and keeps the investigation active. |
| `RepoTrail: Save Recent Activity as Investigation` | Saves the recent rolling-buffer activity and keeps the investigation active. |
| `RepoTrail: Add or Update Checkpoint` | Saves or clears the checkpoint on the active investigation. |
| `RepoTrail: Save and Stop Investigation` | Persists the latest active state and clears the active investigation for that workspace. |
| `RepoTrail: List Saved Investigations` | Lists saved investigations and opens the selected Resume Snapshot. |
| `RepoTrail: Show Resume Snapshot` | Opens the saved Resume Snapshot without reopening files. |
| `RepoTrail: Resume Investigation` | Opens the Resume Snapshot and reopens a conservative set of saved files. |
| `RepoTrail: Delete Investigation` | Deletes one saved investigation. |
| `RepoTrail: Delete All RepoTrail Data` | Deletes all saved investigations and clears in-memory activity for the current session. |
| `RepoTrail: Show Local Storage Location` | Reveals the local storage directory and shows its path. |

## What 0.0.1 captures

RepoTrail 0.0.1 records only the factual data needed for re-entry:

- active editor/file changes
- selection changes used for the last saved location
- edit occurrence, not edit content
- local Git snapshot state:
  - availability
  - repository root
  - `HEAD`
  - branch name or detached `HEAD`
  - modified files
  - untracked files
  - diff stats
- edited files
- file visit counts
- last saved location
- a short recent observed path
- an optional developer-authored checkpoint

RepoTrail 0.0.1 does not currently emit definition/reference navigation events. Those remain deferred until they can be detected reliably through supported VS Code APIs.

## What 0.0.1 does not do

RepoTrail 0.0.1 does not include:

- AI
- graph or timeline dashboards
- browser integration
- cloud sync
- accounts or team features
- exact workspace/tab/layout restoration
- terminal, clipboard, screenshot, or keystroke capture
- full source-code capture

## Local storage

- Saved investigations live under VS Code `globalStorageUri`.
- Each investigation is stored as a schema-versioned JSON envelope.
- RepoTrail retains a `.bak` copy of the previous save for recovery.
- Workspace file paths are stored relatively when possible and re-expanded on load.
- The rolling event buffer remains in memory only and is not persisted as full raw events.

## Source-of-truth docs

- `/home/runner/work/repotrail/repotrail/docs/PRODUCT_BASELINE.md`
- `/home/runner/work/repotrail/repotrail/docs/ARCHITECTURE.md`
- `/home/runner/work/repotrail/repotrail/docs/DECISIONS.md`
- `/home/runner/work/repotrail/repotrail/docs/VALIDATION.md`
- `/home/runner/work/repotrail/repotrail/docs/AGENT_HANDOFF.md`

## Development

### Prerequisites

- Node.js (LTS)
- VS Code

### Setup

```bash
npm install
```

### Commands

| Command | Description |
|---|---|
| `npm run compile` | Compile TypeScript to `out/` |
| `npm run watch` | Compile in watch mode |
| `npm run lint` | Run ESLint on `src/` |
| `npm run typecheck` | Type-check without emitting |
| `npm run test:unit` | Run unit tests without launching VS Code |
| `npm test` | Run extension-host tests with `@vscode/test-cli` |
| `npm run package` | Build a `.vsix` package with `vsce` |

### Run locally

1. Open this folder in VS Code.
2. Press **F5** to launch the Extension Development Host.
3. Use the RepoTrail commands from the Command Palette.

### Verification

```bash
npm run compile
npm run lint
npm run typecheck
npm run test:unit
npm test
npm run package
```
