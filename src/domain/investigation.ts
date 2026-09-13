/**
 * Factory functions for domain objects.
 */

import * as crypto from 'crypto';
import {
  Checkpoint,
  GitSnapshot,
  Investigation,
  InvestigationBrowserReference,
  InvestigationNavigationEdge,
  InvestigationNavigationGraph,
  InvestigationNavigationNode,
  InvestigationNavigationRelationship,
  InvestigationFileEditTimelineEntry,
  InvestigationGitSnapshotTimelineEntry,
  InvestigationTimelineEntry,
  InvestigationTimelineSavePointReason,
  ObservedEvent,
  Snapshot,
} from './types';

const INVESTIGATION_TIMELINE_MAX_ENTRIES = 200;

const VISIT_EVENT_TYPES: ReadonlySet<ObservedEvent['type']> = new Set([
  'editor.active',
  'navigation.definition',
  'navigation.reference',
]);

function navigationTimestamp(value: string): number {
  return eventTimestamp(value);
}

function cloneNavigationNode(
  node: InvestigationNavigationNode,
): InvestigationNavigationNode {
  return { ...node };
}

function cloneNavigationEdge(
  edge: InvestigationNavigationEdge,
): InvestigationNavigationEdge {
  return { ...edge };
}

function cloneNavigationGraphInternal(
  graph: InvestigationNavigationGraph,
): InvestigationNavigationGraph {
  return {
    nodes: graph.nodes.map(cloneNavigationNode),
    edges: graph.edges.map(cloneNavigationEdge),
  };
}

function currentNavigationGraphFilePath(
  graph: InvestigationNavigationGraph,
): string | null {
  let currentFilePath: string | null = null;
  let currentTimestamp = Number.NEGATIVE_INFINITY;

  for (const node of graph.nodes) {
    const timestamp = navigationTimestamp(node.lastObservedAt);
    if (timestamp >= currentTimestamp) {
      currentTimestamp = timestamp;
      currentFilePath = node.filePath;
    }
  }

  return currentFilePath;
}

function hasNavigationNode(
  graph: InvestigationNavigationGraph,
  filePath: string,
): boolean {
  return graph.nodes.some((node) => node.filePath === filePath);
}

function maxTimestamp(left: string, right: string): string {
  return navigationTimestamp(left) >= navigationTimestamp(right) ? left : right;
}

function upsertNavigationNode(
  nodes: InvestigationNavigationNode[],
  filePath: string,
  timestamp: string,
  visitIncrement: number,
  editIncrement: number,
): InvestigationNavigationNode[] {
  const nodeIndex = nodes.findIndex((node) => node.filePath === filePath);
  if (nodeIndex < 0) {
    nodes.push({
      kind: 'file',
      filePath,
      visitCount: visitIncrement,
      editCount: editIncrement,
      lastObservedAt: timestamp,
    });
    return nodes;
  }

  const existing = nodes[nodeIndex];
  nodes[nodeIndex] = {
    ...existing,
    visitCount: existing.visitCount + visitIncrement,
    editCount: existing.editCount + editIncrement,
    lastObservedAt: maxTimestamp(existing.lastObservedAt, timestamp),
  };
  return nodes;
}

function upsertNavigationEdge(
  edges: InvestigationNavigationEdge[],
  fromFilePath: string,
  toFilePath: string,
  relationship: InvestigationNavigationRelationship,
  timestamp: string,
): InvestigationNavigationEdge[] {
  const edgeIndex = edges.findIndex(
    (edge) =>
      edge.fromFilePath === fromFilePath &&
      edge.toFilePath === toFilePath &&
      edge.relationship === relationship,
  );

  if (edgeIndex < 0) {
    edges.push({
      fromFilePath,
      toFilePath,
      relationship,
      count: 1,
      lastObservedAt: timestamp,
    });
    return edges;
  }

  const existing = edges[edgeIndex];
  edges[edgeIndex] = {
    ...existing,
    count: existing.count + 1,
    lastObservedAt: maxTimestamp(existing.lastObservedAt, timestamp),
  };
  return edges;
}

function appendFileObservationToNavigationGraph(
  graph: InvestigationNavigationGraph,
  filePath: string,
  timestamp: string,
  relationship: InvestigationNavigationRelationship | null,
  visitIncrement: number,
  editIncrement: number,
): InvestigationNavigationGraph {
  const previousFilePath = currentNavigationGraphFilePath(graph);
  const moved = previousFilePath !== filePath;
  const nextVisitIncrement =
    visitIncrement > 0 && (moved || !hasNavigationNode(graph, filePath))
      ? visitIncrement
      : 0;

  if (nextVisitIncrement === 0 && editIncrement === 0) {
    return cloneNavigationGraphInternal(graph);
  }

  const nodes = graph.nodes.map(cloneNavigationNode);
  upsertNavigationNode(nodes, filePath, timestamp, nextVisitIncrement, editIncrement);

  const edges = graph.edges.map(cloneNavigationEdge);
  if (relationship && previousFilePath && moved) {
    upsertNavigationEdge(edges, previousFilePath, filePath, relationship, timestamp);
  }

  return { nodes, edges };
}

function relationshipForVisitEvent(
  eventType: ObservedEvent['type'],
): InvestigationNavigationRelationship | null {
  switch (eventType) {
    case 'navigation.definition':
      return 'definition';
    case 'navigation.reference':
      return 'reference';
    case 'editor.active':
      return 'transition';
    default:
      return null;
  }
}

function eventTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function currentTimelineFilePath(
  timeline: readonly InvestigationTimelineEntry[],
): string | null {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index];
    if (entry.type === 'file.transition' || entry.type === 'file.edit') {
      return entry.filePath;
    }
  }

  return null;
}

function toGitTimelineEntry(git: GitSnapshot): InvestigationGitSnapshotTimelineEntry {
  return {
    timestamp: git.timestamp,
    type: 'git.snapshot',
    availability: git.availability,
    branch: git.branch,
    head: git.head,
    modifiedCount: git.modifiedFiles.length,
    untrackedCount: git.untrackedFiles.length,
    filesChanged: git.diffStats.filesChanged,
    insertions: git.diffStats.insertions,
    deletions: git.diffStats.deletions,
  };
}

function hasSameGitSummary(
  left: InvestigationGitSnapshotTimelineEntry,
  right: InvestigationGitSnapshotTimelineEntry,
): boolean {
  return (
    left.availability === right.availability &&
    left.branch === right.branch &&
    left.head === right.head &&
    left.modifiedCount === right.modifiedCount &&
    left.untrackedCount === right.untrackedCount &&
    left.filesChanged === right.filesChanged &&
    left.insertions === right.insertions &&
    left.deletions === right.deletions
  );
}

function lastGitTimelineEntry(
  timeline: readonly InvestigationTimelineEntry[],
): InvestigationGitSnapshotTimelineEntry | null {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index];
    if (entry.type === 'git.snapshot') {
      return entry;
    }
  }

  return null;
}

function cloneFileEditTimelineEntry(
  entry: InvestigationFileEditTimelineEntry,
): InvestigationFileEditTimelineEntry {
  return { ...entry };
}

/** Create an empty Snapshot. */
export function createEmptySnapshot(): Snapshot {
  return {
    editedFiles: [],
    visitedFileCounts: {},
    lastLocation: null,
    recentEvents: [],
    git: null,
  };
}

export function createEmptyNavigationGraph(): InvestigationNavigationGraph {
  return {
    nodes: [],
    edges: [],
  };
}

/** Create a new Investigation with sensible defaults. */
export function createInvestigation(
  name: string,
  workspace: string,
  repository: string | null = null,
): Investigation {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    workspace,
    repository,
    createdAt: now,
    savedAt: now,
    lastResumedAt: null,
    checkpoint: null,
    browserReferences: [],
    snapshot: createEmptySnapshot(),
    navigationGraph: createEmptyNavigationGraph(),
    timeline: [],
  };
}

export function cloneBrowserReference(
  reference: InvestigationBrowserReference,
): InvestigationBrowserReference {
  return { ...reference };
}

export function cloneNavigationGraph(
  graph: InvestigationNavigationGraph,
): InvestigationNavigationGraph {
  return cloneNavigationGraphInternal(graph);
}

export function getLatestNavigationGraphFilePath(
  graph: InvestigationNavigationGraph,
): string | null {
  return currentNavigationGraphFilePath(graph);
}

export function cloneTimelineEntry(
  entry: InvestigationTimelineEntry,
): InvestigationTimelineEntry {
  switch (entry.type) {
    case 'file.edit':
      return cloneFileEditTimelineEntry(entry);
    default:
      return { ...entry };
  }
}

export function trimInvestigationTimeline(
  timeline: InvestigationTimelineEntry[],
): InvestigationTimelineEntry[] {
  if (timeline.length <= INVESTIGATION_TIMELINE_MAX_ENTRIES) {
    return timeline;
  }

  return timeline.slice(-INVESTIGATION_TIMELINE_MAX_ENTRIES);
}

export function buildTimelineFromObservedEvents(
  events: readonly ObservedEvent[],
): InvestigationTimelineEntry[] {
  let timeline: InvestigationTimelineEntry[] = [];
  for (const event of [...events].sort((left, right) => {
    return eventTimestamp(left.timestamp) - eventTimestamp(right.timestamp);
  })) {
    timeline = appendObservedEventToTimeline(timeline, event);
  }

  return timeline;
}

export function buildNavigationGraphFromObservedEvents(
  events: readonly ObservedEvent[],
): InvestigationNavigationGraph {
  let graph = createEmptyNavigationGraph();
  for (const event of [...events].sort((left, right) => {
    return eventTimestamp(left.timestamp) - eventTimestamp(right.timestamp);
  })) {
    graph = appendObservedEventToNavigationGraph(graph, event);
  }

  return graph;
}

export function buildNavigationGraphFromTimeline(
  timeline: readonly InvestigationTimelineEntry[],
): InvestigationNavigationGraph {
  let graph = createEmptyNavigationGraph();
  for (const entry of [...timeline].sort((left, right) => {
    return eventTimestamp(left.timestamp) - eventTimestamp(right.timestamp);
  })) {
    if (entry.type === 'file.transition') {
      graph = appendFileObservationToNavigationGraph(
        graph,
        entry.filePath,
        entry.timestamp,
        'transition',
        1,
        0,
      );
      continue;
    }

    if (entry.type === 'file.edit') {
      const currentFilePath = currentNavigationGraphFilePath(graph);
      graph = appendFileObservationToNavigationGraph(
        graph,
        entry.filePath,
        entry.timestamp,
        currentFilePath !== entry.filePath ? 'transition' : null,
        currentFilePath !== entry.filePath ? 1 : 0,
        entry.count,
      );
    }
  }

  return graph;
}

export function appendObservedEventToNavigationGraph(
  graph: InvestigationNavigationGraph,
  event: ObservedEvent,
): InvestigationNavigationGraph {
  if (!event.filePath) {
    return cloneNavigationGraphInternal(graph);
  }

  if (VISIT_EVENT_TYPES.has(event.type)) {
    const relationship = relationshipForVisitEvent(event.type);
    if (!relationship) {
      return cloneNavigationGraphInternal(graph);
    }

    return appendFileObservationToNavigationGraph(
      graph,
      event.filePath,
      event.timestamp,
      relationship,
      1,
      0,
    );
  }

  if (event.type !== 'file.edit') {
    return cloneNavigationGraphInternal(graph);
  }

  const currentFilePath = currentNavigationGraphFilePath(graph);
  return appendFileObservationToNavigationGraph(
    graph,
    event.filePath,
    event.timestamp,
    currentFilePath !== event.filePath ? 'transition' : null,
    currentFilePath !== event.filePath ? 1 : 0,
    1,
  );
}

export function appendObservedEventToTimeline(
  timeline: readonly InvestigationTimelineEntry[],
  event: ObservedEvent,
): InvestigationTimelineEntry[] {
  if (!event.filePath) {
    return [...timeline];
  }

  const currentFilePath = currentTimelineFilePath(timeline);
  if (VISIT_EVENT_TYPES.has(event.type)) {
    if (currentFilePath === event.filePath) {
      return [...timeline];
    }

    return trimInvestigationTimeline([
      ...timeline,
      {
        timestamp: event.timestamp,
        type: 'file.transition',
        filePath: event.filePath,
      },
    ]);
  }

  if (event.type !== 'file.edit') {
    return [...timeline];
  }

  let nextTimeline = [...timeline];
  if (currentFilePath !== event.filePath) {
    nextTimeline = trimInvestigationTimeline([
      ...nextTimeline,
      {
        timestamp: event.timestamp,
        type: 'file.transition',
        filePath: event.filePath,
      },
    ]);
  }

  const lastEntry = nextTimeline[nextTimeline.length - 1];
  if (lastEntry?.type === 'file.edit' && lastEntry.filePath === event.filePath) {
    return trimInvestigationTimeline([
      ...nextTimeline.slice(0, -1),
      {
        ...lastEntry,
        timestamp: event.timestamp,
        count: lastEntry.count + 1,
      },
    ]);
  }

  return trimInvestigationTimeline([
    ...nextTimeline,
    {
      timestamp: event.timestamp,
      type: 'file.edit',
      filePath: event.filePath,
      count: 1,
    },
  ]);
}

export function appendCheckpointToTimeline(
  timeline: readonly InvestigationTimelineEntry[],
  text: string | null,
  timestamp: string,
): InvestigationTimelineEntry[] {
  return trimInvestigationTimeline([
    ...timeline,
    {
      timestamp,
      type: 'checkpoint',
      text,
    },
  ]);
}

export function appendGitSnapshotToTimeline(
  timeline: readonly InvestigationTimelineEntry[],
  git: GitSnapshot | null,
): InvestigationTimelineEntry[] {
  if (!git) {
    return [...timeline];
  }

  const nextEntry = toGitTimelineEntry(git);
  const previousGit = lastGitTimelineEntry(timeline);
  if (previousGit && hasSameGitSummary(previousGit, nextEntry)) {
    return [...timeline];
  }

  return trimInvestigationTimeline([...timeline, nextEntry]);
}

export function appendSavePointToTimeline(
  timeline: readonly InvestigationTimelineEntry[],
  timestamp: string,
  reason: InvestigationTimelineSavePointReason,
): InvestigationTimelineEntry[] {
  return trimInvestigationTimeline([
    ...timeline,
    {
      timestamp,
      type: 'save.point',
      reason,
    },
  ]);
}

export function appendResumePointToTimeline(
  timeline: readonly InvestigationTimelineEntry[],
  timestamp: string,
): InvestigationTimelineEntry[] {
  return trimInvestigationTimeline([
    ...timeline,
    {
      timestamp,
      type: 'resume.point',
    },
  ]);
}

/** Create a Checkpoint. */
export function createCheckpoint(text: string): Checkpoint {
  return {
    text,
    createdAt: new Date().toISOString(),
  };
}
