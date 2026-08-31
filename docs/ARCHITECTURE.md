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
├── capture/        # VS Code event listeners → ObservedEvent production
├── git/            # Git adapter: read-only local Git state queries
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
| git | GitSnapshot \| null | Git state at snapshot time |

### GitSnapshot
| Field | Type | Description |
|-------|------|-------------|
| timestamp | string (ISO-8601) | Capture time |
| head | string | HEAD commit SHA |
| branch | string \| null | Current branch (null if detached) |
| modifiedFiles | string[] | Uncommitted tracked changes |
| untrackedFiles | string[] | Untracked files |
| diffStats | { filesChanged, insertions, deletions } | Summary diff stats |

### ObservedEvent
| Field | Type | Description |
|-------|------|-------------|
| timestamp | string (ISO-8601) | When it happened |
| type | ObservedEventType | Factual event kind |
| workspace | string | Workspace path |
| filePath | string? | File path if relevant |
| source | Record<string, string>? | Minimal metadata |

ObservedEventType: `file.open`, `file.close`, `file.edit`, `file.save`, `editor.focus`, `navigation.definition`, `navigation.reference`, `debug.start`, `debug.stop`.

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
  "schemaVersion": 1,
  "investigation": { ... }
}
```

**Schema versioning:** The `schemaVersion` field is checked on load. Unknown or future versions are rejected (returns null). Future versions will implement migration functions keyed by version number.

**Properties:**
- Local-only, no cloud.
- Human-inspectable JSON files.
- Survives extension restarts and VS Code reloads (files on disk).
- No external database.
- Malformed files are silently skipped during listing.

## Event Capture Concept

The extension observes factual VS Code activity:

- File opens, closes, edits (not content).
- Active editor changes.
- Definition/reference navigations.
- Debug session starts/stops.

Events are recorded as factual observations (`ObservedEvent`) with timestamp, type, and minimal metadata. No semantic interpretation is applied.

## Rolling-Buffer Concept

Observed events are stored in a bounded, time-limited rolling buffer rather than an unbounded log.

- Fixed maximum event count (configurable, reasonable default).
- Events older than a configurable window are discarded.
- Buffer is per-workspace.
- Purpose: provide recent activity context when a Snapshot is taken, not permanent telemetry.

## Git Adapter Boundary

The Git adapter is a read-only query layer over the local repository:

- Uses VS Code's built-in Git extension API or direct Git CLI calls.
- Never modifies the repository (no commits, no pushes).
- Provides GitSnapshot data on demand.
- Handles missing/invalid Git repositories gracefully.

Git enriches context; it does not become the product.

## UI / Command Boundary

Minimal command surface for 0.0.1:

- Save/create Investigation.
- Resume Investigation.
- List Investigations.
- Add/edit Checkpoint text.
- View current Snapshot.

## Testing Strategy

- **Unit tests** (`npm run test:unit`): Domain model and storage tests run via Mocha without VS Code.
- **Integration tests** (`npm test`): Extension activation tests via `@vscode/test-cli`.
- Test runner TDD-style suites with `suite`/`test`.

## Unresolved Technical Questions

1. **Git API choice**: VS Code built-in Git extension API vs. direct `git` CLI subprocess?
2. **Rolling buffer persistence**: In-memory only vs. persisted across restarts?
3. **Event granularity**: Exact set of VS Code events to observe.
4. **Snapshot trigger**: Automatic periodic snapshots vs. manual-only?
5. **Multi-root workspaces**: How to handle in 0.0.1.
6. **Data migration**: Strategy for migrating stored data between schema versions.
