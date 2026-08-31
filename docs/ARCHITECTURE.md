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
├── commands/       # VS Code command handlers
├── ui/             # Webview panels, tree views, status bar
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
| recentEvents | ObservedEvent[] | Recent events from rolling buffer |
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

- Save/create Investigation.
- Resume Investigation.
- List Investigations.
- Add/edit Checkpoint text.
- View current Snapshot.

## Testing Strategy

- **Unit tests** (`npm run test:unit`): Domain model, storage, rolling buffer, and Git snapshot parser/adapter tests run via Mocha without VS Code.
- **Integration tests** (`npm test`): Extension activation and VS Code event-capture tests via `@vscode/test-cli`.
- Test runner TDD-style suites with `suite`/`test`.

## Unresolved Technical Questions

1. **Snapshot trigger**: Automatic periodic snapshots vs. manual-only?
2. **Multi-root workspaces**: How to handle in 0.0.1.
3. **Future data migration**: Strategy for schema changes beyond the current v1 → v2 migration.
