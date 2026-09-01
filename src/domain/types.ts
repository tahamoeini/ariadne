/**
 * RepoTrail 0.0.1 — Core Domain Types
 *
 * All types are plain data objects suitable for JSON serialization.
 * No methods, no class hierarchies, no semantic scoring fields.
 */

/** Factual event types observed from VS Code activity. */
export type ObservedEventType =
  | 'editor.active'
  | 'editor.selection'
  | 'file.edit'
  | 'navigation.definition'
  | 'navigation.reference';

/** Availability state for a Git snapshot capture attempt. */
export type GitSnapshotAvailability =
  | 'available'
  | 'not-repository'
  | 'git-missing'
  | 'git-error';

/** Persisted capture profile used for controlled validation. */
export type InvestigationCaptureProfile =
  | 'standard'
  | 'checkpoint-only'
  | 'checkpoint-git'
  | 'git-trail';

/** A single factual observation of developer activity. */
export interface ObservedEvent {
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** What happened. */
  type: ObservedEventType;
  /** Workspace folder path. */
  workspace: string;
  /** Repository root path, if identifiable. */
  repository: string | null;
  /** Absolute file path, when available. */
  filePath?: string;
  /** 1-based cursor location, when available. */
  location?: FileLocation;
  /** Minimal source metadata (e.g. language id, symbol name). */
  source?: Record<string, string>;
}

/** Read-only capture of local Git state at a point in time. */
export interface GitSnapshot {
  /** ISO-8601 timestamp when captured. */
  timestamp: string;
  /** Outcome of the snapshot capture attempt. */
  availability: GitSnapshotAvailability;
  /** Absolute repository root path, if identifiable. */
  repositoryRoot: string | null;
  /** HEAD commit SHA, if the repository has a current commit. */
  head: string | null;
  /** Current branch name, or null if detached. */
  branch: string | null;
  /** Repository-relative paths with uncommitted tracked changes. */
  modifiedFiles: string[];
  /** Repository-relative paths not tracked by Git. */
  untrackedFiles: string[];
  /** Summary diff stats: files changed, insertions, deletions. */
  diffStats: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}

/** Cursor / editor location. */
export interface FileLocation {
  filePath: string;
  line: number;
  column: number;
}

/** Point-in-time capture of investigation state. */
export interface Snapshot {
  /** Files the developer edited during this investigation. */
  editedFiles: string[];
  /** Map of file path → visit count. */
  visitedFileCounts: Record<string, number>;
  /** Last known cursor location, if any. */
  lastLocation: FileLocation | null;
  /** Recent observed events (from rolling buffer). */
  recentEvents: ObservedEvent[];
  /** Git capture state at snapshot time, if captured. */
  git: GitSnapshot | null;
}

/** Developer-authored context note. */
export interface Checkpoint {
  /** Free-form text written by the developer. */
  text: string;
  /** ISO-8601 timestamp when the checkpoint was created. */
  createdAt: string;
}

/** A named unit of work representing a code exploration session. */
export interface Investigation {
  /** Unique identifier (UUID v4). */
  id: string;
  /** Human-readable name chosen by the developer. */
  name: string;
  /** Workspace folder path. */
  workspace: string;
  /** Repository root path, if the workspace is inside a Git repo. */
  repository: string | null;
  /** ISO-8601 timestamp when created. */
  createdAt: string;
  /** ISO-8601 timestamp when last persisted. */
  savedAt: string;
  /** ISO-8601 timestamp when last resumed, if ever. */
  lastResumedAt: string | null;
  /** Which data families are allowed to persist for this investigation. */
  captureProfile: InvestigationCaptureProfile;
  /** Optional developer checkpoint. */
  checkpoint: Checkpoint | null;
  /** Current snapshot of investigation state. */
  snapshot: Snapshot;
}
