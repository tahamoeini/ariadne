# RepoTrail 0.0.1 — Architecture

## Technical Assumptions

- VS Code desktop is the only supported editor.
- TypeScript is the implementation language.
- Node.js runtime provided by VS Code.
- Local Git repositories only (no remote operations).
- All data stored locally on the developer's machine.
- No network access required or used by the extension.
- VS Code extension API is the sole integration surface.

## Module Boundaries

```
src/
├── extension.ts    # VS Code entry point (activate / deactivate)
├── domain/         # Core types and factory functions
│   ├── types.ts    # Investigation, Checkpoint, Snapshot, GitSnapshot, ObservedEvent
│   ├── investigation.ts  # Factory functions (createInvestigation, etc.)
│   └── index.ts    # Public re-exports
├── capture/        # Rolling buffer + VS Code event listeners
│   ├── eventBuffer.ts      # Time-bounded per-workspace buffers
│   ├── vscodeEventCapture.ts # VS Code listeners → ObservedEvent production
│   └── index.ts            # Public re-exports
├── git/            # Git adapter: read-only local Git state queries
│   ├── snapshot.ts # Repo root detection + safe local Git snapshot capture
│   └── index.ts    # Public re-exports
├── storage/        # JSON-file persistence
│   ├── store.ts    # CRUD operations + schema envelope
│   └── index.ts    # Public re-exports
├── commands/       # Investigation lifecycle service + VS Code command handlers
│   ├── investigationLifecycle.ts      # Active-investigation state + snapshot assembly
│   ├── registerInvestigationCommands.ts # Command Palette handlers and prompts
│   └── index.ts                      # Public re-exports
├── ui/             # Resume Snapshot rendering + virtual-document provider
└── test/           # Unit and integration tests
```

Modules communicate through domain types. No module directly imports another module's internals.

## Domain Model (Implemented)

### Investigation
| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID v4) | Unique identifier |
| name | string | Human-readable name |
| workspace | string | Workspace folder path |
| repository | string \| null | Git repo root, if available |
| createdAt | string (ISO-8601) | Creation timestamp |
| savedAt | string (ISO-8601) | Last persisted timestamp |
| lastResumedAt | string \| null | Last resumed timestamp |
| checkpoint | Checkpoint \| null | Optional developer note |
| snapshot | Snapshot | Current state capture |

### Checkpoint
| Field | Type | Description |
|-------|------|-------------|
| text | string | Free-form developer note |
| createdAt | string (ISO-8601) | Creation timestamp |

### Snapshot
| Field | Type | Description |
|-------|------|-------------|
| editedFiles | string[] | Files edited during investigation |
| visitedFileCounts | Record<string, number> | File path → visit count |
| lastLocation | FileLocation \| null | Last cursor position |
| recentEvents | ObservedEvent[] | Recent factual observed events retained for the investigation |
| git | GitSnapshot \| null | Git capture result at snapshot time |

### GitSnapshot
| Field | Type | Description |
|-------|------|-------------|
| timestamp | string (ISO-8601) | Capture time |
| availability | `available` \| `not-repository` \| `git-missing` \| `git-error` | Capture outcome |
| repositoryRoot | string \| null | Absolute repository root path |
| head | string \| null | HEAD commit SHA, if one exists |
| branch | string \| null | Current branch (null if detached) |
| modifiedFiles | string[] | Repository-relative tracked changes |
| untrackedFiles | string[] | Repository-relative untracked files |
| diffStats | { filesChanged, insertions, deletions } | Summary diff stats |

### ObservedEvent
| Field | Type | Description |
|-------|------|-------------|
| timestamp | string (ISO-8601) | When it happened |
| type | ObservedEventType | Factual event kind |
| workspace | string | Workspace path |
| repository | string \| null | Repository root if identifiable |
| filePath | string? | File path if relevant |
| location | FileLocation? | Last known 1-based line/column for the event |
| source | Record<string, string>? | Minimal metadata |

ObservedEventType: `editor.active`, `editor.selection`, `file.edit`, `navigation.definition`, `navigation.reference`.

## Storage Mechanism

**Location:** `ExtensionContext.globalStorageUri.fsPath` (passed to storage module by caller).

**Layout:**
```
<globalStorageDir>/
  investigations/
    <uuid>.json
    <uuid>.json
```

**Format:** Each file is a JSON envelope:
```json
{
  "schemaVersion": 2,
  "investigation": { ... }
}
```

**Schema versioning:** The `schemaVersion` field is checked on load. Current saves use schema version 2. Legacy version 1 investigations are migrated on load to populate the explicit Git availability fields. Unknown future versions are rejected (returns null).

**Properties:**
- Local-only, no cloud.
- Human-inspectable JSON files.
- Survives extension restarts and VS Code reloads (files on disk).
- No external database.
- Malformed files are silently skipped during listing.
- Active investigation pointers are stored separately in `ExtensionContext.workspaceState` so a workspace can recover its current investigation after extension restart without changing the on-disk investigation schema.

## Event Capture Concept

The extension observes factual VS Code activity:

- Active editor/file transitions.
- Selection changes that provide meaningful last cursor/location context.
- Text edit occurrence (not content).
- Workspace and repository context for file-backed editors.

Definition/reference navigation is intentionally deferred unless it becomes reliably detectable through supported VS Code APIs. Events are recorded as factual observations (`ObservedEvent`) with timestamp, workspace/repository context, optional location, and minimal metadata. No semantic interpretation is applied.

## Rolling-Buffer Concept

Observed events are stored in a bounded, time-limited rolling buffer rather than an unbounded log.

- Default retention window is 20 minutes and is internally configurable.
- Events older than the retention window are discarded on read/write.
- Buffer is kept in memory only and resets on extension restart.
- Buffer is per-workspace, with a safety max-event cap to avoid unbounded growth during noisy sessions.
- Purpose: provide recent activity context when a Snapshot is taken, not permanent telemetry.
- The capture adapter also exposes synchronous reads of recent events/last location plus an observed-event stream so an active Investigation can accumulate factual visit/edit evidence while it remains active.
- A developer-only debug API exposes the current factual events for inspection during extension development.

## Git Adapter Boundary

The Git adapter is a read-only query layer over the local repository:

- Uses the local `git` executable directly via fixed argv lists (`git -C <repoRoot> ...`), never through a shell.
- Detects the repository root first by walking upward for a `.git` directory/file so missing Git can still return an explicit repository-aware state.
- Never modifies the repository (no commits, no pushes).
- Provides GitSnapshot data on demand.
- Handles missing/invalid Git repositories, detached HEAD, unborn repositories, and missing Git executables without failing the rest of the workflow.
- Produces repository-relative changed-file lists and inexpensive aggregate diff stats only.
- A saved GitSnapshot represents THEN; resume flows should capture a fresh NOW snapshot later for comparison.

Git enriches context; it does not become the product.

## UI / Command Boundary

Minimal command surface for 0.0.1:

- Start Investigation.
- Save Recent Activity as Investigation.
- Add or update Checkpoint text on the active Investigation.
- Save and stop the active Investigation.
- List saved Investigations.
- Open Resume Snapshot for a saved Investigation.
- Resume a saved Investigation by reopening a conservative set of files.
- Delete an Investigation.

The current lifecycle uses VS Code-native `showInputBox`, `showQuickPick`, confirmation messages, and a read-only virtual Markdown document for the Resume Snapshot. No custom webview or complex UI is introduced in this milestone.

## Investigation Lifecycle (Implemented)

- At most one Investigation is active per workspace.
- Creating an Investigation captures the current rolling-buffer evidence, current Git Snapshot, last known location, edited-file evidence, and visited-file counts.
- While an Investigation is active, newly observed events are merged into its in-memory Snapshot so developers do not need to manually curate visit/edit evidence during longer sessions.
- Checkpoint updates persist immediately and refresh the saved Git Snapshot without introducing additional workflow states.
- Saving/stopping the Investigation persists the latest factual state and clears the active workspace pointer.

## Resume Snapshot (Implemented)

- Saved Investigations can be opened into a read-only virtual Markdown document backed by a VS Code `TextDocumentContentProvider`.
- The Snapshot shows factual re-entry context in a fixed order: investigation name, optional checkpoint, saved timestamp, workspace/repository, branch when saved, saved Git state, current Git state, factual saved-vs-current Git differences, edited files, revisited files with explicit visit counts, last location, and a short recent observed path.
- Missing or unavailable data is rendered explicitly instead of inferred, including absent checkpoints, missing Git state, deleted/moved saved paths, and missing/corrupted Investigation payloads.

## Resume Actions (Implemented)

- `RepoTrail: Resume Investigation` first opens the read-only Resume Snapshot (remember) and then reopens a conservative set of saved files (reopen).
- Reopen planning is based only on factual evidence already captured in the Investigation: the last saved file/location, edited files, and revisited-file counts.
- The reopen limit is intentionally small (5 files by default) to avoid recreating a huge tab set.
- If the last saved file still exists, the command reopens it last and moves the cursor to the saved line/column, clamped to the file's current bounds when the location is stale.
- Missing files, missing workspaces, changed branches, repository drift, and no-Git states do not fail the resume flow; the Snapshot still opens and the command reports partial recovery honestly.
- Resume does not attempt exact workspace/window/tab restoration or infer semantic importance.

## Testing Strategy

- **Unit tests** (`npm run test:unit`): Domain model, storage, rolling buffer, Git snapshot parser/adapter, and Investigation lifecycle service tests run via Mocha without VS Code.
- **Integration tests** (`npm test`): Extension activation, command registration, lifecycle command flow, and VS Code event-capture tests via `@vscode/test-cli`.
- Test runner TDD-style suites with `suite`/`test`.

## Unresolved Technical Questions

1. **Snapshot trigger**: Automatic periodic snapshots vs. manual-only?
2. **Multi-root workspaces**: How to handle in 0.0.1.
3. **Future data migration**: Strategy for schema changes beyond the current v1 → v2 migration.
