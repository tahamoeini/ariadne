import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { GitSnapshot } from '../domain';

const GIT_OUTPUT_MAX_BUFFER = 20 * 1024 * 1024;

export interface GitCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
}

export type GitCommandRunner = (workingDirectory: string, args: string[]) => GitCommandResult;

export interface CaptureGitSnapshotOptions {
  now?: () => number;
  runGit?: GitCommandRunner;
}

export interface ParsedGitStatus {
  branch: string | null;
  noCommits: boolean;
  modifiedFiles: string[];
  untrackedFiles: string[];
}

function stripTrailingLineBreaks(value: string): string {
  return value.replace(/[\r\n]+$/, '');
}

function emptyDiffStats(): GitSnapshot['diffStats'] {
  return {
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
  };
}

function createUnavailableSnapshot(
  timestamp: string,
  availability: Exclude<GitSnapshot['availability'], 'available'>,
  repositoryRoot: string | null = null,
): GitSnapshot {
  return {
    timestamp,
    availability,
    repositoryRoot,
    head: null,
    branch: null,
    modifiedFiles: [],
    untrackedFiles: [],
    diffStats: emptyDiffStats(),
  };
}

function defaultRunGit(workingDirectory: string, args: string[]): GitCommandResult {
  const result = spawnSync('git', ['-C', workingDirectory, ...args], {
    encoding: 'utf8',
    maxBuffer: GIT_OUTPUT_MAX_BUFFER,
  });

  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

function resolveSearchDirectory(targetPath: string): string {
  const absolutePath = path.resolve(targetPath);
  if (!fs.existsSync(absolutePath)) {
    return absolutePath;
  }

  try {
    return fs.statSync(absolutePath).isDirectory() ? absolutePath : path.dirname(absolutePath);
  } catch {
    return absolutePath;
  }
}

function dedupePaths(paths: string[]): string[] {
  return Array.from(new Set(paths));
}

function mergeDiffStats(
  base: GitSnapshot['diffStats'],
  next: GitSnapshot['diffStats'],
  filesChanged: number,
): GitSnapshot['diffStats'] {
  return {
    filesChanged,
    insertions: base.insertions + next.insertions,
    deletions: base.deletions + next.deletions,
  };
}

function isGitMissing(result: GitCommandResult): boolean {
  return result.error?.code === 'ENOENT';
}

export function findGitRepositoryRoot(targetPath: string): string | null {
  let currentDirectory = resolveSearchDirectory(targetPath);

  while (true) {
    if (fs.existsSync(path.join(currentDirectory, '.git'))) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return null;
    }
    currentDirectory = parentDirectory;
  }
}

export function parseGitDiffStats(output: string): GitSnapshot['diffStats'] {
  const filesChanged = output.match(/(\d+)\sfiles?\schanged/);
  const insertions = output.match(/(\d+)\sinsertions?\(\+\)/);
  const deletions = output.match(/(\d+)\sdeletions?\(-\)/);

  return {
    filesChanged: filesChanged ? Number.parseInt(filesChanged[1], 10) : 0,
    insertions: insertions ? Number.parseInt(insertions[1], 10) : 0,
    deletions: deletions ? Number.parseInt(deletions[1], 10) : 0,
  };
}

export function parseGitStatus(output: string): ParsedGitStatus {
  const records = output.split('\0').filter((record) => record.length > 0);
  let branch: string | null = null;
  let noCommits = false;
  let index = 0;

  if (records[0]?.startsWith('## ')) {
    const header = records[0].slice(3);
    if (header.startsWith('No commits yet on ')) {
      branch = header.slice('No commits yet on '.length);
      noCommits = true;
    } else if (header !== 'HEAD (no branch)') {
      const trackingSeparator = header.indexOf('...');
      branch = trackingSeparator === -1 ? header : header.slice(0, trackingSeparator);
    }
    index = 1;
  }

  const modifiedFiles: string[] = [];
  const untrackedFiles: string[] = [];

  while (index < records.length) {
    const record = records[index];
    const status = record.slice(0, 2);
    const filePath = record.slice(3);

    if (status === '??') {
      untrackedFiles.push(filePath);
    } else if (status !== '!!' && filePath) {
      modifiedFiles.push(filePath);
    }

    index += 1;
    if ((status.includes('R') || status.includes('C')) && index < records.length) {
      index += 1;
    }
  }

  return {
    branch,
    noCommits,
    modifiedFiles: dedupePaths(modifiedFiles),
    untrackedFiles: dedupePaths(untrackedFiles),
  };
}

function readHeadCommit(
  repositoryRoot: string,
  noCommits: boolean,
  runGit: GitCommandRunner,
): string | null | 'git-error' | 'git-missing' {
  const result = runGit(repositoryRoot, ['rev-parse', '--verify', 'HEAD']);
  if (isGitMissing(result)) {
    return 'git-missing';
  }

  if (result.exitCode === 0) {
    return stripTrailingLineBreaks(result.stdout);
  }

  return noCommits ? null : 'git-error';
}

function readTrackedDiffStats(
  repositoryRoot: string,
  runGit: GitCommandRunner,
): GitSnapshot['diffStats'] | 'git-error' | 'git-missing' {
  const result = runGit(repositoryRoot, ['diff', '--shortstat', '--no-ext-diff', 'HEAD', '--']);
  if (isGitMissing(result)) {
    return 'git-missing';
  }

  if (result.exitCode !== 0) {
    return 'git-error';
  }

  return parseGitDiffStats(result.stdout);
}

function readInitialDiffStats(
  repositoryRoot: string,
  modifiedFileCount: number,
  runGit: GitCommandRunner,
): GitSnapshot['diffStats'] | 'git-error' | 'git-missing' {
  const staged = runGit(repositoryRoot, ['diff', '--shortstat', '--no-ext-diff', '--cached', '--root', '--']);
  if (isGitMissing(staged)) {
    return 'git-missing';
  }
  if (staged.exitCode !== 0) {
    return 'git-error';
  }

  const unstaged = runGit(repositoryRoot, ['diff', '--shortstat', '--no-ext-diff', '--']);
  if (isGitMissing(unstaged)) {
    return 'git-missing';
  }
  if (unstaged.exitCode !== 0) {
    return 'git-error';
  }

  return mergeDiffStats(
    parseGitDiffStats(staged.stdout),
    parseGitDiffStats(unstaged.stdout),
    modifiedFileCount,
  );
}

export function captureGitSnapshot(
  targetPath: string,
  options: CaptureGitSnapshotOptions = {},
): GitSnapshot {
  const timestamp = new Date((options.now ?? Date.now)()).toISOString();
  const repositoryRoot = findGitRepositoryRoot(targetPath);
  if (!repositoryRoot) {
    return createUnavailableSnapshot(timestamp, 'not-repository');
  }

  const runGit = options.runGit ?? defaultRunGit;
  const statusResult = runGit(repositoryRoot, [
    'status',
    '--porcelain=v1',
    '--branch',
    '-z',
    '--untracked-files=all',
  ]);

  if (isGitMissing(statusResult)) {
    return createUnavailableSnapshot(timestamp, 'git-missing', repositoryRoot);
  }

  if (statusResult.exitCode !== 0) {
    return createUnavailableSnapshot(timestamp, 'git-error', repositoryRoot);
  }

  const status = parseGitStatus(statusResult.stdout);
  const head = readHeadCommit(repositoryRoot, status.noCommits, runGit);
  if (head === 'git-missing') {
    return createUnavailableSnapshot(timestamp, 'git-missing', repositoryRoot);
  }
  if (head === 'git-error') {
    return createUnavailableSnapshot(timestamp, 'git-error', repositoryRoot);
  }

  const diffStats = head === null
    ? readInitialDiffStats(repositoryRoot, status.modifiedFiles.length, runGit)
    : readTrackedDiffStats(repositoryRoot, runGit);
  if (diffStats === 'git-missing') {
    return createUnavailableSnapshot(timestamp, 'git-missing', repositoryRoot);
  }
  if (diffStats === 'git-error') {
    return createUnavailableSnapshot(timestamp, 'git-error', repositoryRoot);
  }

  return {
    timestamp,
    availability: 'available',
    repositoryRoot,
    head,
    branch: status.branch,
    modifiedFiles: status.modifiedFiles,
    untrackedFiles: status.untrackedFiles,
    diffStats,
  };
}
