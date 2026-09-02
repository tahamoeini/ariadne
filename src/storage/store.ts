/**
 * RepoTrail — Local JSON file persistence.
 *
 * Storage location: a directory passed in by the caller (typically
 * `ExtensionContext.globalStorageUri.fsPath`).
 *
 * Layout:
 *   <storageDir>/
 *     investigations/
 *       <id>.json          — current saved Investigation
 *       <id>.json.bak      — previous save kept for recovery
 *
 * Each JSON file wraps a minimized Investigation payload in an envelope with a
 * schema version so future migrations are possible.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  FileLocation,
  GitSnapshot,
  Investigation,
  InvestigationBrowserReference,
  InvestigationNavigationEdge,
  InvestigationNavigationGraph,
  InvestigationNavigationNode,
  InvestigationNavigationRelationship,
  InvestigationTimelineEntry,
  InvestigationTimelineSavePointReason,
  ObservedEvent,
  buildNavigationGraphFromTimeline,
  appendCheckpointToTimeline,
  appendGitSnapshotToTimeline,
  appendResumePointToTimeline,
  appendSavePointToTimeline,
  buildTimelineFromObservedEvents,
  trimInvestigationTimeline,
} from '../domain';

/** Current schema version. Bump when the persisted shape changes. */
export const SCHEMA_VERSION = 6;

const INVESTIGATIONS_DIR_NAME = 'investigations';
const BACKUP_SUFFIX = '.bak';
const TEMP_FILE_SEGMENT = '.tmp-';
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const RECENT_PATH_LIMIT = 5;

const VISIT_EVENT_TYPES: ReadonlySet<ObservedEvent['type']> = new Set([
  'editor.active',
  'navigation.definition',
  'navigation.reference',
]);

interface LegacyGitSnapshot {
  timestamp: string;
  head: string;
  branch: string | null;
  modifiedFiles: string[];
  untrackedFiles: string[];
  diffStats: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}

interface LegacyInvestigation {
  id: string;
  name: string;
  workspace: string;
  repository: string | null;
  createdAt: string;
  savedAt: string;
  lastResumedAt: string | null;
  checkpoint: Investigation['checkpoint'];
  snapshot: Omit<Investigation['snapshot'], 'git'> & {
    git: LegacyGitSnapshot | null;
  };
}

interface PersistedCheckpoint {
  text: string;
}

interface PersistedBrowserReference {
  url: string;
  title: string | null;
  capturedAt: string;
}

interface PersistedFileLocation {
  filePath: string;
  line: number;
  column: number;
}

interface PersistedGitSnapshot {
  timestamp: string;
  availability: GitSnapshot['availability'];
  head: string | null;
  branch: string | null;
  modifiedFiles: string[];
  untrackedFiles: string[];
  diffStats: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}

interface PersistedFileTransitionTimelineEntry {
  timestamp: string;
  type: 'file.transition';
  filePath: string;
}

interface PersistedFileEditTimelineEntry {
  timestamp: string;
  type: 'file.edit';
  filePath: string;
  count: number;
}

interface PersistedCheckpointTimelineEntry {
  timestamp: string;
  type: 'checkpoint';
  text: string | null;
}

interface PersistedGitSnapshotTimelineEntry {
  timestamp: string;
  type: 'git.snapshot';
  availability: GitSnapshot['availability'];
  head: string | null;
  branch: string | null;
  modifiedCount: number;
  untrackedCount: number;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

interface PersistedSavePointTimelineEntry {
  timestamp: string;
  type: 'save.point';
  reason: InvestigationTimelineSavePointReason;
}

interface PersistedResumePointTimelineEntry {
  timestamp: string;
  type: 'resume.point';
}

interface PersistedNavigationNode {
  kind: 'file';
  filePath: string;
  visitCount: number;
  editCount: number;
  lastObservedAt: string;
}

interface PersistedNavigationEdge {
  fromFilePath: string;
  toFilePath: string;
  relationship: InvestigationNavigationRelationship;
  count: number;
  lastObservedAt: string;
}

interface PersistedNavigationGraph {
  nodes: PersistedNavigationNode[];
  edges: PersistedNavigationEdge[];
}

type PersistedTimelineEntry =
  | PersistedFileTransitionTimelineEntry
  | PersistedFileEditTimelineEntry
  | PersistedCheckpointTimelineEntry
  | PersistedGitSnapshotTimelineEntry
  | PersistedSavePointTimelineEntry
  | PersistedResumePointTimelineEntry;

interface PersistedInvestigation {
  id: string;
  name: string;
  workspace: string;
  repository: string | null;
  savedAt: string;
  checkpoint: PersistedCheckpoint | null;
  browserReferences: PersistedBrowserReference[];
  navigationGraph: PersistedNavigationGraph;
  timeline: PersistedTimelineEntry[];
  snapshot: {
    editedFiles: string[];
    visitedFileCounts: Record<string, number>;
    lastLocation: PersistedFileLocation | null;
    recentPath: string[];
    git: PersistedGitSnapshot | null;
  };
}

/** On-disk envelope. */
export interface StorageEnvelope {
  schemaVersion: number;
  investigation: PersistedInvestigation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeInvestigationId(id: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(id);
}

function ensurePrivatePermissions(targetPath: string, isDirectory: boolean): void {
  try {
    fs.chmodSync(targetPath, isDirectory ? DIRECTORY_MODE : FILE_MODE);
  } catch {
    // Best-effort only; some platforms ignore POSIX modes.
  }
}

/** Ensure the investigations directory exists. */
function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: DIRECTORY_MODE });
  ensurePrivatePermissions(dir, true);
}

function investigationsDir(storageDir: string): string {
  return path.join(storageDir, INVESTIGATIONS_DIR_NAME);
}

function primaryFilePath(storageDir: string, id: string): string | null {
  if (!isSafeInvestigationId(id)) {
    return null;
  }

  return path.join(investigationsDir(storageDir), `${id}.json`);
}

function backupFilePath(storageDir: string, id: string): string | null {
  const primary = primaryFilePath(storageDir, id);
  return primary ? `${primary}${BACKUP_SUFFIX}` : null;
}

function tempFilePath(storageDir: string, id: string): string | null {
  const primary = primaryFilePath(storageDir, id);
  return primary ? `${primary}${TEMP_FILE_SEGMENT}${process.pid}-${Date.now()}` : null;
}

function isWithinRoot(filePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, filePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function normalizeStoredPathSeparators(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function usesPosixPathStyle(rootPath: string): boolean {
  return rootPath.startsWith('/') && !rootPath.includes('\\');
}

function toStoredPath(filePath: string, workspacePath: string): string {
  if (!isWithinRoot(filePath, workspacePath)) {
    return filePath;
  }

  const relativePath = path.relative(workspacePath, filePath);
  return normalizeStoredPathSeparators(relativePath || '.');
}

function fromStoredPath(filePath: string, workspacePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  if (usesPosixPathStyle(workspacePath)) {
    return path.posix.resolve(workspacePath, normalizeStoredPathSeparators(filePath));
  }

  return path.resolve(workspacePath, filePath);
}

function dedupePaths(paths: string[]): string[] {
  return Array.from(new Set(paths));
}

function emptyDiffStats(): GitSnapshot['diffStats'] {
  return {
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
  };
}

function normalizeNumber(
  value: unknown,
  minimum: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(minimum, Math.floor(value));
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function timestampValue(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function normalizeBrowserReferenceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function isGitAvailability(value: unknown): value is GitSnapshot['availability'] {
  return (
    value === 'available' ||
    value === 'not-repository' ||
    value === 'git-missing' ||
    value === 'git-error'
  );
}

function isSavePointReason(value: unknown): value is InvestigationTimelineSavePointReason {
  return value === 'start' || value === 'save-recent' || value === 'save-stop' || value === 'save';
}

function isNavigationRelationship(
  value: unknown,
): value is InvestigationNavigationRelationship {
  return value === 'transition' || value === 'definition' || value === 'reference';
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function normalizeWorkspaceFileList(
  value: unknown,
  workspacePath: string,
): string[] {
  return dedupePaths(
    normalizeStringArray(value).map((filePath) => fromStoredPath(filePath, workspacePath)),
  );
}

function normalizeGitFileList(value: unknown): string[] {
  return dedupePaths(normalizeStringArray(value));
}

function normalizeVisitedFileCounts(
  value: unknown,
  workspacePath: string,
): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  const visitedFileCounts: Record<string, number> = {};
  for (const [filePath, count] of Object.entries(value)) {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      continue;
    }

    const normalizedCount = normalizeNumber(count, 1, 0);
    if (normalizedCount < 1) {
      continue;
    }

    visitedFileCounts[fromStoredPath(filePath, workspacePath)] = normalizedCount;
  }

  return visitedFileCounts;
}

function normalizeLocation(
  value: unknown,
  workspacePath: string,
): FileLocation | null {
  if (!isRecord(value)) {
    return null;
  }

  const filePath = normalizeString(value.filePath);
  if (!filePath) {
    return null;
  }

  return {
    filePath: fromStoredPath(filePath, workspacePath),
    line: normalizeNumber(value.line, 1, 1),
    column: normalizeNumber(value.column, 1, 1),
  };
}

function inferRepository(
  repository: unknown,
  snapshot: unknown,
): string | null {
  const normalizedRepository = normalizeNullableString(repository);
  if (normalizedRepository) {
    return normalizedRepository;
  }

  if (isRecord(snapshot) && isRecord(snapshot.git)) {
    const repositoryRoot = normalizeNullableString(snapshot.git.repositoryRoot);
    if (repositoryRoot) {
      return repositoryRoot;
    }
  }

  if (isRecord(snapshot) && Array.isArray(snapshot.recentEvents)) {
    for (let index = snapshot.recentEvents.length - 1; index >= 0; index -= 1) {
      const event = snapshot.recentEvents[index];
      if (!isRecord(event)) {
        continue;
      }

      const eventRepository = normalizeNullableString(event.repository);
      if (eventRepository) {
        return eventRepository;
      }
    }
  }

  return null;
}

function normalizeRecentPathEntries(
  entries: unknown,
  workspacePath: string,
): string[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  const recentPath: string[] = [];
  for (const entry of entries) {
    let filePath: string | null = null;

    if (typeof entry === 'string' && entry.length > 0) {
      filePath = entry;
    } else if (isRecord(entry)) {
      const eventType = normalizeString(entry.type);
      const eventFilePath = normalizeString(entry.filePath);
      if (eventType && eventFilePath && VISIT_EVENT_TYPES.has(eventType as ObservedEvent['type'])) {
        filePath = eventFilePath;
      }
    }

    if (!filePath) {
      continue;
    }

    const normalizedPath = path.isAbsolute(filePath)
      ? toStoredPath(filePath, workspacePath)
      : filePath;
    if (recentPath[recentPath.length - 1] !== normalizedPath) {
      recentPath.push(normalizedPath);
    }
  }

  return recentPath.slice(-RECENT_PATH_LIMIT);
}

function normalizeTimelineEntries(
  value: unknown,
  workspacePath: string,
): InvestigationTimelineEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const timeline: InvestigationTimelineEntry[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const timestamp = normalizeString(entry.timestamp);
    const type = normalizeString(entry.type);
    if (!timestamp || !type) {
      continue;
    }

    if (type === 'file.transition') {
      const filePath = normalizeString(entry.filePath);
      if (!filePath) {
        continue;
      }

      timeline.push({
        timestamp,
        type,
        filePath: fromStoredPath(filePath, workspacePath),
      });
      continue;
    }

    if (type === 'file.edit') {
      const filePath = normalizeString(entry.filePath);
      if (!filePath) {
        continue;
      }

      timeline.push({
        timestamp,
        type,
        filePath: fromStoredPath(filePath, workspacePath),
        count: normalizeNumber(entry.count, 1, 1),
      });
      continue;
    }

    if (type === 'checkpoint') {
      timeline.push({
        timestamp,
        type,
        text: entry.text === null ? null : normalizeString(entry.text) ?? null,
      });
      continue;
    }

    if (type === 'git.snapshot' && isGitAvailability(entry.availability)) {
      timeline.push({
        timestamp,
        type,
        availability: entry.availability,
        head: normalizeNullableString(entry.head),
        branch: normalizeNullableString(entry.branch),
        modifiedCount: normalizeNumber(entry.modifiedCount, 0, 0),
        untrackedCount: normalizeNumber(entry.untrackedCount, 0, 0),
        filesChanged: normalizeNumber(entry.filesChanged, 0, 0),
        insertions: normalizeNumber(entry.insertions, 0, 0),
        deletions: normalizeNumber(entry.deletions, 0, 0),
      });
      continue;
    }

    if (type === 'save.point') {
      timeline.push({
        timestamp,
        type,
        reason: isSavePointReason(entry.reason) ? entry.reason : 'save',
      });
      continue;
    }

    if (type === 'resume.point') {
      timeline.push({
        timestamp,
        type,
      });
    }
  }

  return trimInvestigationTimeline(timeline);
}

function normalizeNavigationNodes(
  value: unknown,
  workspacePath: string,
): InvestigationNavigationNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const nodes: InvestigationNavigationNode[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const filePath = normalizeString(entry.filePath);
    const lastObservedAt = normalizeString(entry.lastObservedAt);
    if (entry.kind !== 'file' || !filePath || !lastObservedAt) {
      continue;
    }

    nodes.push({
      kind: 'file',
      filePath: fromStoredPath(filePath, workspacePath),
      visitCount: normalizeNumber(entry.visitCount, 0, 0),
      editCount: normalizeNumber(entry.editCount, 0, 0),
      lastObservedAt,
    });
  }

  return nodes;
}

function normalizeNavigationEdges(
  value: unknown,
  workspacePath: string,
): InvestigationNavigationEdge[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const edges: InvestigationNavigationEdge[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const fromFilePath = normalizeString(entry.fromFilePath);
    const toFilePath = normalizeString(entry.toFilePath);
    const lastObservedAt = normalizeString(entry.lastObservedAt);
    if (
      !fromFilePath ||
      !toFilePath ||
      !lastObservedAt ||
      !isNavigationRelationship(entry.relationship)
    ) {
      continue;
    }

    edges.push({
      fromFilePath: fromStoredPath(fromFilePath, workspacePath),
      toFilePath: fromStoredPath(toFilePath, workspacePath),
      relationship: entry.relationship,
      count: normalizeNumber(entry.count, 1, 1),
      lastObservedAt,
    });
  }

  return edges;
}

function normalizeNavigationGraph(
  value: unknown,
  workspacePath: string,
): InvestigationNavigationGraph {
  if (!isRecord(value)) {
    return {
      nodes: [],
      edges: [],
    };
  }

  return {
    nodes: normalizeNavigationNodes(value.nodes, workspacePath),
    edges: normalizeNavigationEdges(value.edges, workspacePath),
  };
}

function inflateRecentEvents(
  recentPath: readonly string[],
  savedAt: string,
  workspacePath: string,
  repositoryPath: string | null,
): ObservedEvent[] {
  return recentPath.map((filePath) => ({
    timestamp: savedAt,
    type: 'editor.active',
    workspace: workspacePath,
    repository: repositoryPath,
    filePath: fromStoredPath(filePath, workspacePath),
  }));
}

function normalizeCheckpoint(
  value: unknown,
  fallbackTimestamp: string,
): Investigation['checkpoint'] {
  if (!isRecord(value)) {
    return null;
  }

  const text = normalizeString(value.text);
  if (!text) {
    return null;
  }

  return {
    text,
    createdAt: normalizeString(value.createdAt) ?? fallbackTimestamp,
  };
}

function normalizeBrowserReferences(value: unknown): InvestigationBrowserReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const referencesByUrl = new Map<string, InvestigationBrowserReference>();
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const url = normalizeBrowserReferenceUrl(entry.url);
    const capturedAt = normalizeString(entry.capturedAt);
    if (!url || !capturedAt) {
      continue;
    }

    const title = entry.title === null ? null : normalizeString(entry.title) ?? null;
    const existing = referencesByUrl.get(url);
    if (!existing) {
      referencesByUrl.set(url, { url, title, capturedAt });
      continue;
    }

    if (timestampValue(capturedAt) >= timestampValue(existing.capturedAt)) {
      referencesByUrl.set(url, {
        url,
        title: title ?? existing.title,
        capturedAt,
      });
      continue;
    }

    if (!existing.title && title) {
      referencesByUrl.set(url, {
        ...existing,
        title,
      });
    }
  }

  return Array.from(referencesByUrl.values()).sort((left, right) => {
    return timestampValue(right.capturedAt) - timestampValue(left.capturedAt) || left.url.localeCompare(right.url);
  });
}

function normalizeDiffStats(value: unknown): GitSnapshot['diffStats'] {
  if (!isRecord(value)) {
    return emptyDiffStats();
  }

  return {
    filesChanged: normalizeNumber(value.filesChanged, 0, 0),
    insertions: normalizeNumber(value.insertions, 0, 0),
    deletions: normalizeNumber(value.deletions, 0, 0),
  };
}

function normalizeGitSnapshot(
  value: unknown,
  repositoryPath: string | null,
  fallbackTimestamp: string,
): GitSnapshot | null {
  if (!isRecord(value) || !isGitAvailability(value.availability)) {
    return null;
  }

  const timestamp = normalizeString(value.timestamp) ?? fallbackTimestamp;
  if (value.availability !== 'available') {
    return {
      timestamp,
      availability: value.availability,
      repositoryRoot: repositoryPath,
      head: null,
      branch: null,
      modifiedFiles: [],
      untrackedFiles: [],
      diffStats: emptyDiffStats(),
    };
  }

  return {
    timestamp,
    availability: 'available',
    repositoryRoot: repositoryPath,
    head: normalizeNullableString(value.head),
    branch: normalizeNullableString(value.branch),
    modifiedFiles: normalizeGitFileList(value.modifiedFiles),
    untrackedFiles: normalizeGitFileList(value.untrackedFiles),
    diffStats: normalizeDiffStats(value.diffStats),
  };
}

function buildLegacyTimeline(investigation: Investigation): InvestigationTimelineEntry[] {
  let timeline = buildTimelineFromObservedEvents(investigation.snapshot.recentEvents);

  if (investigation.checkpoint) {
    timeline = appendCheckpointToTimeline(
      timeline,
      investigation.checkpoint.text,
      investigation.checkpoint.createdAt,
    );
  }

  timeline = appendGitSnapshotToTimeline(timeline, investigation.snapshot.git);
  timeline = appendSavePointToTimeline(timeline, investigation.savedAt, 'save');

  if (investigation.lastResumedAt) {
    timeline = appendResumePointToTimeline(timeline, investigation.lastResumedAt);
  }

  return timeline;
}

function inferLastResumedAtFromTimeline(
  timeline: readonly InvestigationTimelineEntry[],
): string | null {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index];
    if (entry.type === 'resume.point') {
      return entry.timestamp;
    }
  }

  return null;
}

function inferCheckpointCreatedAtFromTimeline(
  timeline: readonly InvestigationTimelineEntry[],
): string | null {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index];
    if (entry.type === 'checkpoint' && entry.text) {
      return entry.timestamp;
    }
  }

  return null;
}

function buildRuntimeInvestigation(
  value: Record<string, unknown>,
  recentPathEntries: unknown,
): Investigation | null {
  const id = normalizeString(value.id);
  const name = normalizeString(value.name);
  const workspace = normalizeString(value.workspace);
  const savedAt = normalizeString(value.savedAt);
  const snapshot = isRecord(value.snapshot) ? value.snapshot : null;
  if (!id || !name || !workspace || !savedAt || !snapshot) {
    return null;
  }

  const repository = inferRepository(value.repository, snapshot);
  const recentPath = normalizeRecentPathEntries(recentPathEntries, workspace);
  const git = normalizeGitSnapshot(snapshot.git, repository, savedAt);
  const persistedTimeline = normalizeTimelineEntries(value.timeline, workspace);
  const persistedGraph = normalizeNavigationGraph(value.navigationGraph, workspace);

  const investigation: Investigation = {
    id,
    name,
    workspace,
    repository,
    createdAt: normalizeString(value.createdAt) ?? savedAt,
    savedAt,
    lastResumedAt: normalizeNullableString(value.lastResumedAt),
    checkpoint: normalizeCheckpoint(
      value.checkpoint,
      inferCheckpointCreatedAtFromTimeline(persistedTimeline) ?? savedAt,
    ),
    browserReferences: normalizeBrowserReferences(value.browserReferences),
    snapshot: {
      editedFiles: normalizeWorkspaceFileList(snapshot.editedFiles, workspace),
      visitedFileCounts: normalizeVisitedFileCounts(snapshot.visitedFileCounts, workspace),
      lastLocation: normalizeLocation(snapshot.lastLocation, workspace),
      recentEvents: inflateRecentEvents(recentPath, savedAt, workspace, repository),
      git,
    },
    navigationGraph: { nodes: [], edges: [] },
    timeline: [],
  };

  const timeline = persistedTimeline.length > 0 ? persistedTimeline : buildLegacyTimeline(investigation);
  const navigationGraph =
    persistedGraph.nodes.length > 0 || persistedGraph.edges.length > 0
      ? persistedGraph
      : buildNavigationGraphFromTimeline(timeline);
  return {
    ...investigation,
    lastResumedAt:
      normalizeNullableString(value.lastResumedAt) ?? inferLastResumedAtFromTimeline(timeline),
    navigationGraph,
    timeline,
  };
}

function migrateGitSnapshot(
  git: LegacyGitSnapshot | null,
  repositoryRoot: string | null,
): GitSnapshot | null {
  if (!git) {
    return null;
  }

  return {
    timestamp: git.timestamp,
    availability: 'available',
    repositoryRoot,
    head: git.head,
    branch: git.branch,
    modifiedFiles: [...git.modifiedFiles],
    untrackedFiles: [...git.untrackedFiles],
    diffStats: { ...git.diffStats },
  };
}

function migrateInvestigationV1(investigation: LegacyInvestigation): Investigation {
  return {
    ...investigation,
    snapshot: {
      ...investigation.snapshot,
      git: migrateGitSnapshot(investigation.snapshot.git, investigation.repository),
    },
    browserReferences: [],
    navigationGraph: { nodes: [], edges: [] },
    timeline: [],
  };
}

function inflateEnvelope(envelope: unknown): Investigation | null {
  if (!isRecord(envelope) || typeof envelope.schemaVersion !== 'number') {
    return null;
  }

  if (envelope.schemaVersion === 1) {
    if (!isRecord(envelope.investigation)) {
      return null;
    }

    const migrated = migrateInvestigationV1(envelope.investigation as unknown as LegacyInvestigation);
    return buildRuntimeInvestigation(
      migrated as unknown as Record<string, unknown>,
      migrated.snapshot.recentEvents,
    );
  }

  if (envelope.schemaVersion === 2) {
    if (!isRecord(envelope.investigation)) {
      return null;
    }

    return buildRuntimeInvestigation(
      envelope.investigation,
      isRecord(envelope.investigation.snapshot)
        ? envelope.investigation.snapshot.recentEvents
        : undefined,
    );
  }

  if (
    envelope.schemaVersion !== 3 &&
    envelope.schemaVersion !== 4 &&
    envelope.schemaVersion !== 5 &&
    envelope.schemaVersion !== SCHEMA_VERSION
  ) {
    return null;
  }

  if (!isRecord(envelope.investigation)) {
    return null;
  }

  return buildRuntimeInvestigation(
    envelope.investigation,
    isRecord(envelope.investigation.snapshot)
      ? envelope.investigation.snapshot.recentPath
      : undefined,
  );
}

function toPersistedGitSnapshot(git: GitSnapshot): PersistedGitSnapshot {
  if (git.availability !== 'available') {
    return {
      timestamp: git.timestamp,
      availability: git.availability,
      head: null,
      branch: null,
      modifiedFiles: [],
      untrackedFiles: [],
      diffStats: emptyDiffStats(),
    };
  }

  return {
    timestamp: git.timestamp,
    availability: 'available',
    head: git.head,
    branch: git.branch,
    modifiedFiles: [...git.modifiedFiles],
    untrackedFiles: [...git.untrackedFiles],
    diffStats: { ...git.diffStats },
  };
}

function toPersistedTimelineEntry(
  entry: InvestigationTimelineEntry,
  workspacePath: string,
): PersistedTimelineEntry {
  switch (entry.type) {
    case 'file.transition':
      return {
        timestamp: entry.timestamp,
        type: entry.type,
        filePath: toStoredPath(entry.filePath, workspacePath),
      };
    case 'file.edit':
      return {
        timestamp: entry.timestamp,
        type: entry.type,
        filePath: toStoredPath(entry.filePath, workspacePath),
        count: normalizeNumber(entry.count, 1, 1),
      };
    case 'checkpoint':
      return {
        timestamp: entry.timestamp,
        type: entry.type,
        text: entry.text,
      };
    case 'git.snapshot':
      return {
        timestamp: entry.timestamp,
        type: entry.type,
        availability: entry.availability,
        head: entry.head,
        branch: entry.branch,
        modifiedCount: normalizeNumber(entry.modifiedCount, 0, 0),
        untrackedCount: normalizeNumber(entry.untrackedCount, 0, 0),
        filesChanged: normalizeNumber(entry.filesChanged, 0, 0),
        insertions: normalizeNumber(entry.insertions, 0, 0),
        deletions: normalizeNumber(entry.deletions, 0, 0),
      };
    case 'save.point':
      return {
        timestamp: entry.timestamp,
        type: entry.type,
        reason: entry.reason,
      };
    case 'resume.point':
      return {
        timestamp: entry.timestamp,
        type: entry.type,
      };
  }
}

function toPersistedNavigationNode(
  node: InvestigationNavigationNode,
  workspacePath: string,
): PersistedNavigationNode {
  return {
    kind: 'file',
    filePath: toStoredPath(node.filePath, workspacePath),
    visitCount: normalizeNumber(node.visitCount, 0, 0),
    editCount: normalizeNumber(node.editCount, 0, 0),
    lastObservedAt: node.lastObservedAt,
  };
}

function toPersistedNavigationEdge(
  edge: InvestigationNavigationEdge,
  workspacePath: string,
): PersistedNavigationEdge {
  return {
    fromFilePath: toStoredPath(edge.fromFilePath, workspacePath),
    toFilePath: toStoredPath(edge.toFilePath, workspacePath),
    relationship: edge.relationship,
    count: normalizeNumber(edge.count, 1, 1),
    lastObservedAt: edge.lastObservedAt,
  };
}

function buildRecentPathFromInvestigation(investigation: Investigation): string[] {
  const recentPath: string[] = [];
  for (const event of investigation.snapshot.recentEvents) {
    if (!event.filePath || !VISIT_EVENT_TYPES.has(event.type)) {
      continue;
    }

    const storedPath = toStoredPath(event.filePath, investigation.workspace);
    if (recentPath[recentPath.length - 1] !== storedPath) {
      recentPath.push(storedPath);
    }
  }

  return recentPath.slice(-RECENT_PATH_LIMIT);
}

function toPersistedInvestigation(investigation: Investigation): PersistedInvestigation {
  const visitedFileCounts: Record<string, number> = {};
  for (const [filePath, count] of Object.entries(investigation.snapshot.visitedFileCounts)) {
    const normalizedCount = normalizeNumber(count, 1, 0);
    if (normalizedCount < 1) {
      continue;
    }

    visitedFileCounts[toStoredPath(filePath, investigation.workspace)] = normalizedCount;
  }

  return {
    id: investigation.id,
    name: investigation.name,
    workspace: investigation.workspace,
    repository: investigation.repository,
    savedAt: investigation.savedAt,
    checkpoint: investigation.checkpoint ? { text: investigation.checkpoint.text } : null,
    browserReferences: investigation.browserReferences.map((reference) => ({
      url: reference.url,
      title: reference.title,
      capturedAt: reference.capturedAt,
    })),
    navigationGraph: {
      nodes: investigation.navigationGraph.nodes.map((node) =>
        toPersistedNavigationNode(node, investigation.workspace),
      ),
      edges: investigation.navigationGraph.edges.map((edge) =>
        toPersistedNavigationEdge(edge, investigation.workspace),
      ),
    },
    timeline: investigation.timeline.map((entry) =>
      toPersistedTimelineEntry(entry, investigation.workspace),
    ),
    snapshot: {
      editedFiles: dedupePaths(
        investigation.snapshot.editedFiles.map((filePath) =>
          toStoredPath(filePath, investigation.workspace),
        ),
      ),
      visitedFileCounts,
      lastLocation: investigation.snapshot.lastLocation
        ? {
            ...investigation.snapshot.lastLocation,
            filePath: toStoredPath(
              investigation.snapshot.lastLocation.filePath,
              investigation.workspace,
            ),
          }
        : null,
      recentPath: buildRecentPathFromInvestigation(investigation),
      git: investigation.snapshot.git
        ? toPersistedGitSnapshot(investigation.snapshot.git)
        : null,
    },
  };
}

function readEnvelope(filePath: string | null): unknown | null {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function restoreBackup(primaryPath: string | null, backupPath: string | null): void {
  if (!primaryPath || !backupPath || !fs.existsSync(backupPath)) {
    return;
  }

  try {
    fs.copyFileSync(backupPath, primaryPath);
    ensurePrivatePermissions(primaryPath, false);
  } catch {
    // Recovery is best-effort; the backup is still available for the current read.
  }
}

function listStoredInvestigationIds(storageDir: string): string[] {
  const dir = investigationsDir(storageDir);
  if (!fs.existsSync(dir)) {
    return [];
  }

  try {
    const ids = new Set<string>();
    for (const entry of fs.readdirSync(dir)) {
      let id: string | null = null;
      if (entry.endsWith('.json')) {
        id = entry.slice(0, -'.json'.length);
      } else if (entry.endsWith(`.json${BACKUP_SUFFIX}`)) {
        id = entry.slice(0, -`.json${BACKUP_SUFFIX}`.length);
      }

      if (id && isSafeInvestigationId(id)) {
        ids.add(id);
      }
    }

    return Array.from(ids);
  } catch {
    return [];
  }
}

function deleteInvestigationArtifacts(storageDir: string, id: string): boolean {
  if (!isSafeInvestigationId(id)) {
    return false;
  }

  const dir = investigationsDir(storageDir);
  if (!fs.existsSync(dir)) {
    return false;
  }

  let deleted = false;
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (
        entry === `${id}.json` ||
        entry === `${id}.json${BACKUP_SUFFIX}` ||
        entry.startsWith(`${id}.json${TEMP_FILE_SEGMENT}`)
      ) {
        fs.rmSync(path.join(dir, entry), { force: true });
        deleted = true;
      }
    }
  } catch {
    return deleted;
  }

  return deleted;
}

interface SaveInvestigationOptions {
  savedAt?: string;
}

/** Save (create or update) an investigation to disk. */
export function saveInvestigation(
  storageDir: string,
  investigation: Investigation,
  options: SaveInvestigationOptions = {},
): Investigation {
  const primary = primaryFilePath(storageDir, investigation.id);
  const backup = backupFilePath(storageDir, investigation.id);
  const temp = tempFilePath(storageDir, investigation.id);
  if (!primary || !backup || !temp) {
    throw new Error('Invalid investigation id.');
  }

  ensureDir(storageDir);
  ensureDir(investigationsDir(storageDir));

  const savedAt = options.savedAt ?? new Date().toISOString();
  const savedInvestigation: Investigation = {
    ...investigation,
    savedAt,
  };
  const envelope: StorageEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    investigation: toPersistedInvestigation(savedInvestigation),
  };

  fs.writeFileSync(temp, JSON.stringify(envelope, null, 2), {
    encoding: 'utf-8',
    mode: FILE_MODE,
  });
  ensurePrivatePermissions(temp, false);

  if (fs.existsSync(primary)) {
    fs.rmSync(backup, { force: true });
    fs.renameSync(primary, backup);
    ensurePrivatePermissions(backup, false);
  }

  try {
    fs.renameSync(temp, primary);
    ensurePrivatePermissions(primary, false);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    if (!fs.existsSync(primary) && fs.existsSync(backup)) {
      try {
        fs.renameSync(backup, primary);
      } catch {
        // Preserve the backup for later recovery if restoration fails.
      }
    }
    throw error;
  }

  return savedInvestigation;
}

/** Load a single investigation by id. Returns null if not found or unreadable. */
export function loadInvestigation(
  storageDir: string,
  id: string,
): Investigation | null {
  const primary = primaryFilePath(storageDir, id);
  const backup = backupFilePath(storageDir, id);
  const primaryInvestigation = inflateEnvelope(readEnvelope(primary));
  if (primaryInvestigation) {
    return primaryInvestigation;
  }

  const backupInvestigation = inflateEnvelope(readEnvelope(backup));
  if (!backupInvestigation) {
    return null;
  }

  restoreBackup(primary, backup);
  return backupInvestigation;
}

/** List all persisted investigations. Skips files that fail to parse. */
export function listInvestigations(storageDir: string): Investigation[] {
  return listStoredInvestigationIds(storageDir)
    .map((id) => loadInvestigation(storageDir, id))
    .filter((investigation): investigation is Investigation => Boolean(investigation));
}

/** Delete an investigation from disk. Returns true if any matching artifact existed. */
export function deleteInvestigation(storageDir: string, id: string): boolean {
  return deleteInvestigationArtifacts(storageDir, id);
}

/** Delete all RepoTrail storage artifacts and return the number of saved investigation ids removed. */
export function deleteAllInvestigations(storageDir: string): number {
  const deletedCount = listStoredInvestigationIds(storageDir).length;
  fs.rmSync(storageDir, { recursive: true, force: true });
  return deletedCount;
}
