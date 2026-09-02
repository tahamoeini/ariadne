/**
 * Factory functions for domain objects.
 */

import * as crypto from 'crypto';
import {
  Checkpoint,
  GitSnapshot,
  Investigation,
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
    snapshot: createEmptySnapshot(),
    timeline: [],
  };
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
