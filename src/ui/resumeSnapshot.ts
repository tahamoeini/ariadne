import * as fs from 'fs';
import * as path from 'path';
import {
  GitSnapshot,
  Investigation,
  InvestigationNavigationRelationship,
  InvestigationTimelineEntry,
  InvestigationTimelineSavePointReason,
  getLatestNavigationGraphFilePath,
} from '../domain';

const MISSING_PATH_SUFFIX = ' — saved path missing (deleted or moved)';
const NAVIGATION_GRAPH_EDGE_DISPLAY_LIMIT = 8;
const NAVIGATION_GRAPH_NEIGHBOR_DISPLAY_LIMIT = 5;

export interface ResumeSnapshotRenderOptions {
  fileExists?: (filePath: string) => boolean;
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/');
}

function isWithinRoot(filePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, filePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function toDisplayPath(filePath: string, investigation: Investigation): string {
  if (investigation.repository && isWithinRoot(filePath, investigation.repository)) {
    const relativeToRepository = path.relative(investigation.repository, filePath);
    return normalizePath(relativeToRepository || path.basename(filePath));
  }

  if (isWithinRoot(filePath, investigation.workspace)) {
    const relativeToWorkspace = path.relative(investigation.workspace, filePath);
    return normalizePath(relativeToWorkspace || path.basename(filePath));
  }

  return normalizePath(filePath);
}

function describeSavedFile(
  filePath: string,
  investigation: Investigation,
  fileExists: (filePath: string) => boolean,
): string {
  const displayPath = toDisplayPath(filePath, investigation);
  return fileExists(filePath) ? displayPath : `${displayPath}${MISSING_PATH_SUFFIX}`;
}

function summarizeFileList(paths: string[], maxItems = 5): string {
  if (paths.length <= maxItems) {
    return paths.map(normalizePath).join(', ');
  }

  const visible = paths.slice(0, maxItems).map(normalizePath).join(', ');
  return `${visible}, +${paths.length - maxItems} more`;
}

function eventTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function describeBranch(branch: string | null): string {
  return branch ?? 'detached HEAD';
}

function describeHead(head: string | null): string {
  return head ?? 'no commits';
}

function describeNavigationRelationship(
  relationship: InvestigationNavigationRelationship,
): string {
  switch (relationship) {
    case 'transition':
      return 'transition';
    case 'definition':
      return 'definition';
    case 'reference':
      return 'reference';
  }
}

function relationshipPriority(relationship: InvestigationNavigationRelationship): number {
  switch (relationship) {
    case 'definition':
      return 2;
    case 'reference':
      return 1;
    case 'transition':
      return 0;
  }
}

function describeGitAvailability(git: GitSnapshot | null, tense: 'saved' | 'current'): string[] {
  if (!git) {
    return [`- No Git snapshot was ${tense === 'saved' ? 'stored' : 'captured'}.`];
  }

  if (git.availability === 'not-repository') {
    return [
      `- No Git repository was detected ${tense === 'saved' ? 'when saved' : 'for the current workspace'}.`,
      `- Captured: ${git.timestamp}`,
    ];
  }

  if (git.availability === 'git-missing') {
    return [
      `- The Git executable was unavailable ${tense === 'saved' ? 'when saved' : 'for the current snapshot'}.`,
      `- Captured: ${git.timestamp}`,
      `- Repository: ${git.repositoryRoot ?? 'unknown'}`,
    ];
  }

  if (git.availability === 'git-error') {
    return [
      `- Git state could not be captured ${tense === 'saved' ? 'when saved' : 'for the current snapshot'}.`,
      `- Captured: ${git.timestamp}`,
      `- Repository: ${git.repositoryRoot ?? 'unknown'}`,
    ];
  }

  const workingTree =
    git.modifiedFiles.length === 0 && git.untrackedFiles.length === 0
      ? 'clean'
      : `${git.modifiedFiles.length} modified, ${git.untrackedFiles.length} untracked`;

  return [
    `- Captured: ${git.timestamp}`,
    `- Repository: ${git.repositoryRoot ?? 'unknown'}`,
    `- Branch: ${describeBranch(git.branch)}`,
    `- HEAD: ${describeHead(git.head)}`,
    `- Working tree: ${workingTree}`,
    `- Diff stats: +${git.diffStats.insertions} / -${git.diffStats.deletions} across ${git.diffStats.filesChanged} modified files`,
  ];
}

function compareGitSnapshots(savedGit: GitSnapshot | null, currentGit: GitSnapshot | null): string[] {
  if (!savedGit && !currentGit) {
    return ['- No saved or current Git snapshot is available for comparison.'];
  }

  if (!savedGit) {
    return ['- No saved Git snapshot is available for comparison.'];
  }

  if (!currentGit) {
    return ['- No current Git snapshot could be captured for comparison.'];
  }

  if (savedGit.availability !== 'available' || currentGit.availability !== 'available') {
    if (savedGit.availability === currentGit.availability) {
      return ['- Saved and current Git state are both unavailable for the same reason.'];
    }

    return [`- Git availability changed: ${savedGit.availability} → ${currentGit.availability}`];
  }

  const differences: string[] = [];
  const savedModifiedSet = new Set(savedGit.modifiedFiles);
  const currentModifiedSet = new Set(currentGit.modifiedFiles);
  const savedUntrackedSet = new Set(savedGit.untrackedFiles);
  const currentUntrackedSet = new Set(currentGit.untrackedFiles);

  if (savedGit.branch !== currentGit.branch) {
    differences.push(`- Branch changed: ${describeBranch(savedGit.branch)} → ${describeBranch(currentGit.branch)}`);
  }

  if (savedGit.head !== currentGit.head) {
    differences.push(`- HEAD changed: ${describeHead(savedGit.head)} → ${describeHead(currentGit.head)}`);
  }

  if (savedGit.modifiedFiles.length !== currentGit.modifiedFiles.length) {
    differences.push(
      `- Modified file count changed: ${savedGit.modifiedFiles.length} → ${currentGit.modifiedFiles.length}`,
    );
  }

  if (savedGit.untrackedFiles.length !== currentGit.untrackedFiles.length) {
    differences.push(
      `- Untracked file count changed: ${savedGit.untrackedFiles.length} → ${currentGit.untrackedFiles.length}`,
    );
  }

  const nowModified = currentGit.modifiedFiles.filter((filePath) => !savedModifiedSet.has(filePath));
  if (nowModified.length > 0) {
    differences.push(`- Now modified: ${summarizeFileList(nowModified)}`);
  }

  const noLongerModified = savedGit.modifiedFiles.filter((filePath) => !currentModifiedSet.has(filePath));
  if (noLongerModified.length > 0) {
    differences.push(`- No longer modified: ${summarizeFileList(noLongerModified)}`);
  }

  const nowUntracked = currentGit.untrackedFiles.filter((filePath) => !savedUntrackedSet.has(filePath));
  if (nowUntracked.length > 0) {
    differences.push(`- Now untracked: ${summarizeFileList(nowUntracked)}`);
  }

  const noLongerUntracked = savedGit.untrackedFiles.filter(
    (filePath) => !currentUntrackedSet.has(filePath),
  );
  if (noLongerUntracked.length > 0) {
    differences.push(`- No longer untracked: ${summarizeFileList(noLongerUntracked)}`);
  }

  if (
    savedGit.diffStats.filesChanged !== currentGit.diffStats.filesChanged ||
    savedGit.diffStats.insertions !== currentGit.diffStats.insertions ||
    savedGit.diffStats.deletions !== currentGit.diffStats.deletions
  ) {
    differences.push(
      `- Diff stats changed: +${savedGit.diffStats.insertions} / -${savedGit.diffStats.deletions} → +${currentGit.diffStats.insertions} / -${currentGit.diffStats.deletions}`,
    );
  }

  return differences.length > 0 ? differences : ['- No saved/current Git differences were detected.'];
}

function describeLastLocation(
  investigation: Investigation,
  fileExists: (filePath: string) => boolean,
): string {
  const location = investigation.snapshot.lastLocation;
  if (!location) {
    return '- No last location was captured.';
  }

  const displayPath = toDisplayPath(location.filePath, investigation);
  const suffix = fileExists(location.filePath) ? '' : MISSING_PATH_SUFFIX;
  return `- ${displayPath}:${location.line}:${location.column}${suffix}`;
}

function buildBrowserReferenceLines(investigation: Investigation): string[] {
  if (investigation.browserReferences.length === 0) {
    return ['- No external references were attached.'];
  }

  return [...investigation.browserReferences]
    .sort((left, right) => {
      return (
        eventTimestamp(right.capturedAt) - eventTimestamp(left.capturedAt) ||
        left.url.localeCompare(right.url)
      );
    })
    .map((reference) => {
      const prefix = reference.title ? `${reference.title} — ` : '';
      return `- ${prefix}${reference.url} — attached ${reference.capturedAt}`;
    });
}

function describeTimelineSavePoint(reason: InvestigationTimelineSavePointReason): string {
  switch (reason) {
    case 'start':
      return 'Started investigation';
    case 'save-recent':
      return 'Saved recent activity as investigation';
    case 'save-stop':
      return 'Saved and stopped investigation';
    case 'save':
      return 'Saved investigation';
  }
}

function describeTimelineGit(entry: Extract<InvestigationTimelineEntry, { type: 'git.snapshot' }>): string {
  if (entry.availability === 'not-repository') {
    return 'Git snapshot: no repository detected';
  }

  if (entry.availability === 'git-missing') {
    return 'Git snapshot: Git executable unavailable';
  }

  if (entry.availability === 'git-error') {
    return 'Git snapshot: capture error';
  }

  return [
    `Git snapshot: ${describeBranch(entry.branch)} @ ${describeHead(entry.head)}`,
    `${entry.modifiedCount} modified`,
    `${entry.untrackedCount} untracked`,
    `+${entry.insertions} / -${entry.deletions} across ${entry.filesChanged} files`,
  ].join('; ');
}

function buildNavigationGraphLines(
  investigation: Investigation,
  fileExists: (filePath: string) => boolean,
): string[] {
  const graph = investigation.navigationGraph;
  if (graph.nodes.length === 0 && graph.edges.length === 0) {
    return ['- No investigation navigation graph was captured.'];
  }

  const anchorFilePath =
    investigation.snapshot.lastLocation?.filePath ??
    getLatestNavigationGraphFilePath(investigation.navigationGraph);
  const lines: string[] = [
    `- Observed artifacts: ${graph.nodes.length} file node(s)`,
    `- Collapsed relationships: ${graph.edges.length}`,
    anchorFilePath
      ? `- Resume anchor: ${describeSavedFile(anchorFilePath, investigation, fileExists)}`
      : '- Resume anchor: none captured',
  ];

  if (anchorFilePath) {
    const neighborSummaries = new Map<
      string,
      {
        filePath: string;
        counts: Record<InvestigationNavigationRelationship, number>;
        lastObservedAt: string;
      }
    >();

    for (const edge of graph.edges) {
      if (edge.fromFilePath !== anchorFilePath && edge.toFilePath !== anchorFilePath) {
        continue;
      }

      const neighborFilePath: string =
        edge.fromFilePath === anchorFilePath ? edge.toFilePath : edge.fromFilePath;
      if (neighborFilePath === anchorFilePath) {
        continue;
      }

      const existing = neighborSummaries.get(neighborFilePath);
      const counts = existing?.counts ?? {
        transition: 0,
        definition: 0,
        reference: 0,
      };
      counts[edge.relationship] += edge.count;

      neighborSummaries.set(neighborFilePath, {
        filePath: neighborFilePath,
        counts,
        lastObservedAt:
          existing && eventTimestamp(existing.lastObservedAt) >= eventTimestamp(edge.lastObservedAt)
            ? existing.lastObservedAt
            : edge.lastObservedAt,
      });
    }

    const sortedNeighbors = Array.from(neighborSummaries.values())
      .sort((left, right) => {
        const leftPriority = Math.max(
          left.counts.definition > 0 ? relationshipPriority('definition') : 0,
          left.counts.reference > 0 ? relationshipPriority('reference') : 0,
          left.counts.transition > 0 ? relationshipPriority('transition') : 0,
        );
        const rightPriority = Math.max(
          right.counts.definition > 0 ? relationshipPriority('definition') : 0,
          right.counts.reference > 0 ? relationshipPriority('reference') : 0,
          right.counts.transition > 0 ? relationshipPriority('transition') : 0,
        );
        const leftTotal = left.counts.definition + left.counts.reference + left.counts.transition;
        const rightTotal = right.counts.definition + right.counts.reference + right.counts.transition;

        return (
          rightPriority - leftPriority ||
          rightTotal - leftTotal ||
          eventTimestamp(right.lastObservedAt) - eventTimestamp(left.lastObservedAt) ||
          left.filePath.localeCompare(right.filePath)
        );
      })
      .slice(0, NAVIGATION_GRAPH_NEIGHBOR_DISPLAY_LIMIT);

    if (sortedNeighbors.length > 0) {
      for (const neighbor of sortedNeighbors) {
        const relationshipSummary = [
          neighbor.counts.definition > 0
            ? `${describeNavigationRelationship('definition')} x${neighbor.counts.definition}`
            : null,
          neighbor.counts.reference > 0
            ? `${describeNavigationRelationship('reference')} x${neighbor.counts.reference}`
            : null,
          neighbor.counts.transition > 0
            ? `${describeNavigationRelationship('transition')} x${neighbor.counts.transition}`
            : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join(', ');
        lines.push(
          `- Anchor neighbor: ${describeSavedFile(neighbor.filePath, investigation, fileExists)} — ${relationshipSummary}`,
        );
      }
    }
  }

  const sortedEdges = [...graph.edges]
    .sort((left, right) => {
      return (
        right.count - left.count ||
        relationshipPriority(right.relationship) - relationshipPriority(left.relationship) ||
        eventTimestamp(right.lastObservedAt) - eventTimestamp(left.lastObservedAt) ||
        left.fromFilePath.localeCompare(right.fromFilePath) ||
        left.toFilePath.localeCompare(right.toFilePath)
      );
    })
    .slice(0, NAVIGATION_GRAPH_EDGE_DISPLAY_LIMIT);

  if (sortedEdges.length > 0) {
    for (const edge of sortedEdges) {
      lines.push(
        `- ${describeSavedFile(edge.fromFilePath, investigation, fileExists)} → ${describeSavedFile(edge.toFilePath, investigation, fileExists)} — ${describeNavigationRelationship(edge.relationship)} x${edge.count}`,
      );
    }
  }

  const omittedEdgeCount = graph.edges.length - sortedEdges.length;
  if (omittedEdgeCount > 0) {
    lines.push(`- ${omittedEdgeCount} additional collapsed relationship(s) omitted.`);
  }

  return lines;
}

function buildTimelineLines(
  investigation: Investigation,
  fileExists: (filePath: string) => boolean,
): string[] {
  if (investigation.timeline.length === 0) {
    return ['- No investigation timeline was captured.'];
  }

  let currentFilePath: string | null = null;
  return investigation.timeline.map((entry) => {
    switch (entry.type) {
      case 'file.transition': {
        const nextFilePath = describeSavedFile(entry.filePath, investigation, fileExists);
        const line = currentFilePath
          ? `${describeSavedFile(currentFilePath, investigation, fileExists)} → ${nextFilePath}`
          : `Focused ${nextFilePath}`;
        currentFilePath = entry.filePath;
        return `- ${entry.timestamp} — ${line}`;
      }
      case 'file.edit': {
        currentFilePath = entry.filePath;
        const countSuffix = entry.count > 1 ? ` (${entry.count} edit events)` : '';
        return `- ${entry.timestamp} — Edited ${describeSavedFile(entry.filePath, investigation, fileExists)}${countSuffix}`;
      }
      case 'checkpoint':
        return entry.text
          ? `- ${entry.timestamp} — Checkpoint: ${entry.text}`
          : `- ${entry.timestamp} — Checkpoint cleared`;
      case 'git.snapshot':
        return `- ${entry.timestamp} — ${describeTimelineGit(entry)}`;
      case 'save.point':
        return `- ${entry.timestamp} — ${describeTimelineSavePoint(entry.reason)}`;
      case 'resume.point':
        return `- ${entry.timestamp} — Resumed investigation`;
    }
  });
}

export function buildResumeSnapshotContent(
  investigation: Investigation,
  currentGit: GitSnapshot | null,
  options: ResumeSnapshotRenderOptions = {},
): string {
  const fileExists = options.fileExists ?? fs.existsSync;
  const revisitedFiles = Object.entries(investigation.snapshot.visitedFileCounts)
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

  const editedFiles =
    investigation.snapshot.editedFiles.length > 0
      ? investigation.snapshot.editedFiles.map((filePath) =>
          `- ${describeSavedFile(filePath, investigation, fileExists)}`,
        )
      : ['- No edited files were captured.'];

  const revisitedFileLines =
    revisitedFiles.length > 0
      ? revisitedFiles.map(
          ([filePath, count]) =>
            `- ${describeSavedFile(filePath, investigation, fileExists)} — ${count} visits`,
        )
      : ['- No revisited files were captured.'];

  const sections: string[] = [
    `# ${investigation.name}`,
    '',
  ];

  if (investigation.checkpoint) {
    sections.push('## Checkpoint', '', investigation.checkpoint.text, '');
  }

  sections.push(
    '## External references',
    '',
    ...buildBrowserReferenceLines(investigation),
    '',
    `Saved timestamp: ${investigation.savedAt}`,
    '',
    '## Workspace / repository',
    '',
    `- Workspace: ${investigation.workspace}`,
    `- Repository: ${investigation.repository ?? 'No repository was captured.'}`,
    '',
    '## Branch when saved',
    '',
    `- ${investigation.snapshot.git?.availability === 'available' ? describeBranch(investigation.snapshot.git.branch) : 'No branch was captured.'}`,
    '',
    '## Git state when saved',
    '',
    ...describeGitAvailability(investigation.snapshot.git, 'saved'),
    '',
    '## Current Git state at open time',
    '',
    ...describeGitAvailability(currentGit, 'current'),
    '',
    '## Saved vs current differences at open time',
    '',
    ...compareGitSnapshots(investigation.snapshot.git, currentGit),
    '',
    '## Edited files',
    '',
    ...editedFiles,
    '',
    '## Revisited files',
    '',
    ...revisitedFileLines,
    '',
    '## Last location',
    '',
    describeLastLocation(investigation, fileExists),
    '',
    '## Investigation navigation graph',
    '',
    ...buildNavigationGraphLines(investigation, fileExists),
    '',
    '## Investigation timeline',
    '',
    ...buildTimelineLines(investigation, fileExists),
  );

  return sections.join('\n');
}

export function buildMissingInvestigationContent(investigationId: string): string {
  return [
    '# Resume Snapshot unavailable',
    '',
    'The Investigation could not be loaded.',
    '',
    `- Investigation id: ${investigationId}`,
    '- The saved file may be missing, deleted, or unreadable.',
  ].join('\n');
}
