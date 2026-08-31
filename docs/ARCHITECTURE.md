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
├── domain/         # Core types: Investigation, Checkpoint, Snapshot, ObservedEvent
├── capture/        # VS Code event listeners → ObservedEvent production
├── git/            # Git adapter: read-only local Git state queries
├── storage/        # Local persistence (read/write investigations)
├── commands/       # VS Code command handlers
└── ui/             # Webview panels, tree views, status bar
```

Modules communicate through domain types. No module directly imports another module's internals.

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

## Core Domain Concepts

### Investigation

A named unit of work representing a code exploration session. Contains an optional Checkpoint and a Snapshot. Investigations can be saved, resumed, and listed.

### Checkpoint

A developer-authored text note attached to an Investigation. Captures human intent and context that observation alone cannot provide. Optional — the developer decides when and whether to write one.

### Snapshot

A point-in-time capture of the Investigation state:

- Edited files list.
- Visited files with counts.
- Last cursor location.
- Recent observed event trail (from rolling buffer).
- Git snapshot.

### GitSnapshot

Read-only capture of local Git state at snapshot time:

- HEAD commit.
- Current branch.
- Modified files.
- Untracked files.
- Diff statistics.

## Git Adapter Boundary

The Git adapter is a read-only query layer over the local repository:

- Uses VS Code's built-in Git extension API or direct Git CLI calls.
- Never modifies the repository (no commits, no pushes).
- Provides GitSnapshot data on demand.
- Handles missing/invalid Git repositories gracefully.

Git enriches context; it does not become the product.

## Storage Boundary

- Uses VS Code `ExtensionContext.globalState` or workspace-local JSON files.
- Simple, inspectable format (JSON).
- No external database.
- No cloud sync.
- Must survive extension restarts and VS Code reloads.
- Schema versioning through a version field in stored data.

## UI / Command Boundary

Minimal command surface for 0.0.1:

- Save/create Investigation.
- Resume Investigation.
- List Investigations.
- Add/edit Checkpoint text.
- View current Snapshot.

UI approach TBD — likely combination of:

- Command palette entries.
- Status bar indicator.
- Simple webview or tree view for investigation list.

## Testing Strategy

- Unit tests for domain logic (Investigation, Snapshot, serialization).
- Unit tests for storage (persist, reload, corrupt data handling).
- Unit tests for Git adapter (mocked Git state).
- Integration tests for event capture (mocked VS Code API).
- Manual smoke tests for extension activation and commands.
- Test runner: VS Code extension test framework or Mocha.

## Unresolved Technical Questions

1. **Storage mechanism**: `globalState` vs. workspace-local JSON files vs. `globalStorageUri` directory? Trade-offs around workspace portability and data size limits.
2. **Git API choice**: VS Code built-in Git extension API vs. direct `git` CLI subprocess? The built-in API is convenient but undocumented/unstable; CLI is reliable but requires parsing.
3. **Rolling buffer persistence**: Should the buffer persist across restarts or only live in memory? Persistence adds complexity but prevents data loss.
4. **Event granularity**: Exact set of VS Code events to observe. Too many creates noise; too few misses context.
5. **Snapshot trigger**: Automatic periodic snapshots vs. manual-only? Automatic adds value but may surprise users.
6. **Multi-root workspaces**: How to handle multi-root workspace configurations in 0.0.1.
7. **Data migration**: Strategy for handling stored data when the schema changes between versions.
