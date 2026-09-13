import * as fs from 'fs';
import {
  FileLocation,
  Investigation,
  InvestigationNavigationEdge,
  InvestigationNavigationNode,
  getLatestNavigationGraphFilePath,
} from '../domain';

export const DEFAULT_RESUME_REOPEN_FILE_LIMIT = 5;

export type ResumeWorkspaceStatus = 'current' | 'available' | 'missing';

export interface ResumePlanOptions {
  currentWorkspacePaths?: string[];
  fileExists?: (filePath: string) => boolean;
  pathExists?: (targetPath: string) => boolean;
  maxFilesToOpen?: number;
}

export interface ResumePlan {
  workspaceStatus: ResumeWorkspaceStatus;
  savedWorkspacePath: string;
  filesToOpen: string[];
  missingFiles: string[];
  omittedFiles: string[];
  targetLocation: FileLocation | null;
  maxFilesToOpen: number;
}

export interface ResumeExecutionResult extends ResumePlan {
  reopenedFiles: string[];
  failedToOpenFiles: string[];
  revealedLocation: FileLocation | null;
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 1) {
    return DEFAULT_RESUME_REOPEN_FILE_LIMIT;
  }

  return Math.max(1, Math.floor(value));
}

function cloneLocation(location: FileLocation | null): FileLocation | null {
  return location ? { ...location } : null;
}

function dedupePaths(paths: string[]): string[] {
  return Array.from(new Set(paths));
}

function compareVisitedFiles(left: [string, number], right: [string, number]): number {
  return right[1] - left[1] || left[0].localeCompare(right[0]);
}

function eventTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function compareGraphTimestamps(left: string, right: string): number {
  return eventTimestamp(right) - eventTimestamp(left);
}

function graphNodeByPath(
  investigation: Investigation,
  filePath: string,
): InvestigationNavigationNode | undefined {
  return investigation.navigationGraph.nodes.find((node) => node.filePath === filePath);
}

function relationshipPriority(edge: InvestigationNavigationEdge): number {
  switch (edge.relationship) {
    case 'definition':
      return 2;
    case 'reference':
      return 1;
    case 'transition':
      return 0;
  }
}

function listGraphNeighborPaths(
  investigation: Investigation,
  anchorFilePath: string | null,
  excludedPaths: ReadonlySet<string>,
): string[] {
  if (!anchorFilePath) {
    return [];
  }

  const neighborScores = new Map<
    string,
    {
      filePath: string;
      navigationCount: number;
      transitionCount: number;
      relationshipPriority: number;
      lastObservedAt: string;
      nodeVisitCount: number;
      nodeEditCount: number;
    }
  >();

  for (const edge of investigation.navigationGraph.edges) {
    if (edge.fromFilePath !== anchorFilePath && edge.toFilePath !== anchorFilePath) {
      continue;
    }

    const otherFilePath: string =
      edge.fromFilePath === anchorFilePath ? edge.toFilePath : edge.fromFilePath;
    if (otherFilePath === anchorFilePath || excludedPaths.has(otherFilePath)) {
      continue;
    }

    const node = graphNodeByPath(investigation, otherFilePath);
    const existing = neighborScores.get(otherFilePath);
    const nextNavigationCount =
      edge.relationship === 'transition'
        ? existing?.navigationCount ?? 0
        : (existing?.navigationCount ?? 0) + edge.count;
    const nextTransitionCount =
      edge.relationship === 'transition'
        ? (existing?.transitionCount ?? 0) + edge.count
        : existing?.transitionCount ?? 0;

    neighborScores.set(otherFilePath, {
      filePath: otherFilePath,
      navigationCount: nextNavigationCount,
      transitionCount: nextTransitionCount,
      relationshipPriority: Math.max(existing?.relationshipPriority ?? 0, relationshipPriority(edge)),
      lastObservedAt:
        existing && compareGraphTimestamps(existing.lastObservedAt, edge.lastObservedAt) <= 0
          ? existing.lastObservedAt
          : edge.lastObservedAt,
      nodeVisitCount: node?.visitCount ?? 0,
      nodeEditCount: node?.editCount ?? 0,
    });
  }

  return Array.from(neighborScores.values())
    .sort((left, right) => {
      return (
        right.relationshipPriority - left.relationshipPriority ||
        right.navigationCount - left.navigationCount ||
        right.transitionCount - left.transitionCount ||
        right.nodeEditCount - left.nodeEditCount ||
        right.nodeVisitCount - left.nodeVisitCount ||
        compareGraphTimestamps(left.lastObservedAt, right.lastObservedAt) ||
        left.filePath.localeCompare(right.filePath)
      );
    })
    .map((entry) => entry.filePath);
}

function listVisitedFallbackPaths(
  investigation: Investigation,
  excludedPaths: ReadonlySet<string>,
): string[] {
  return Object.entries(investigation.snapshot.visitedFileCounts)
    .filter(([filePath, count]) => count > 0 && !excludedPaths.has(filePath))
    .sort(compareVisitedFiles)
    .map(([filePath]) => filePath);
}

function resolveWorkspaceStatus(
  savedWorkspacePath: string,
  currentWorkspacePaths: readonly string[],
  pathExists: (targetPath: string) => boolean,
): ResumeWorkspaceStatus {
  if (currentWorkspacePaths.includes(savedWorkspacePath)) {
    return 'current';
  }

  return pathExists(savedWorkspacePath) ? 'available' : 'missing';
}

export function buildResumePlan(
  investigation: Investigation,
  options: ResumePlanOptions = {},
): ResumePlan {
  const fileExists = options.fileExists ?? fs.existsSync;
  const pathExists = options.pathExists ?? fs.existsSync;
  const currentWorkspacePaths = options.currentWorkspacePaths ?? [];
  const maxFilesToOpen = normalizeLimit(options.maxFilesToOpen);
  const lastLocation = cloneLocation(investigation.snapshot.lastLocation);
  const primaryFilePath =
    lastLocation?.filePath ?? getLatestNavigationGraphFilePath(investigation.navigationGraph);
  const excludedPaths = new Set<string>(investigation.snapshot.editedFiles);

  if (primaryFilePath) {
    excludedPaths.add(primaryFilePath);
  }

  const graphNeighborPaths = listGraphNeighborPaths(
    investigation,
    primaryFilePath,
    excludedPaths,
  );

  const supportCandidates = dedupePaths([
    ...graphNeighborPaths,
    ...investigation.snapshot.editedFiles.filter((filePath) => filePath !== primaryFilePath),
    ...listVisitedFallbackPaths(investigation, excludedPaths),
  ]);

  const primaryExists = primaryFilePath ? fileExists(primaryFilePath) : false;
  const supportLimit = primaryExists ? maxFilesToOpen - 1 : maxFilesToOpen;
  const filesToOpen: string[] = [];
  const missingFiles: string[] = [];
  const omittedFiles: string[] = [];

  for (const filePath of supportCandidates) {
    if (!fileExists(filePath)) {
      missingFiles.push(filePath);
      continue;
    }

    if (filesToOpen.length < supportLimit) {
      filesToOpen.push(filePath);
      continue;
    }

    omittedFiles.push(filePath);
  }

  let targetLocation: FileLocation | null = null;

  if (primaryFilePath) {
    if (primaryExists) {
      filesToOpen.push(primaryFilePath);
      targetLocation = lastLocation?.filePath === primaryFilePath ? lastLocation : null;
    } else if (!primaryExists) {
      missingFiles.push(primaryFilePath);
    }
  }

  return {
    workspaceStatus: resolveWorkspaceStatus(
      investigation.workspace,
      currentWorkspacePaths,
      pathExists,
    ),
    savedWorkspacePath: investigation.workspace,
    filesToOpen,
    missingFiles: dedupePaths(missingFiles),
    omittedFiles,
    targetLocation,
    maxFilesToOpen,
  };
}

export function buildResumeResultMessage(result: ResumeExecutionResult): string {
  const details: string[] = ['opened the Resume Snapshot'];

  if (result.reopenedFiles.length > 0) {
    details.push(`reopened ${result.reopenedFiles.length} saved file(s)`);
  } else {
    details.push('did not reopen any saved files');
  }

  if (result.revealedLocation) {
    details.push('moved to the last saved location');
  }

  if (result.missingFiles.length > 0) {
    details.push(`skipped ${result.missingFiles.length} missing saved file(s)`);
  }

  if (result.failedToOpenFiles.length > 0) {
    details.push(`could not open ${result.failedToOpenFiles.length} saved file(s)`);
  }

  if (result.omittedFiles.length > 0) {
    details.push(`did not reopen ${result.omittedFiles.length} additional saved file(s)`);
  }

  if (result.workspaceStatus === 'available') {
    details.push('the saved workspace path exists but is not currently open');
  } else if (result.workspaceStatus === 'missing') {
    details.push('the saved workspace path is no longer available');
  }

  const [first, ...rest] = details;
  const sentence = [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join('; ');
  return `Ariadne: ${sentence}.`;
}
