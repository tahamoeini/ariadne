/**
 * RepoTrail — Local JSON file persistence.
 *
 * Storage location: a directory passed in by the caller (typically
 * `ExtensionContext.globalStorageUri.fsPath`).
 *
 * Layout:
 *   <storageDir>/
 *     investigations/
 *       <id>.json          — one file per Investigation
 *
 * Each JSON file wraps the Investigation in an envelope with a schema
 * version so future migrations are possible.
 */

import * as fs from 'fs';
import * as path from 'path';
import { GitSnapshot, Investigation } from '../domain/types';

/** Current schema version. Bump when the persisted shape changes. */
export const SCHEMA_VERSION = 2;

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

/** On-disk envelope. */
export interface StorageEnvelope {
  schemaVersion: number;
  investigation: Investigation;
}

interface LegacyStorageEnvelope {
  schemaVersion: 1;
  investigation: LegacyInvestigation;
}

/** Ensure the investigations directory exists. */
function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function investigationsDir(storageDir: string): string {
  return path.join(storageDir, 'investigations');
}

function filePath(storageDir: string, id: string): string {
  return path.join(investigationsDir(storageDir), `${id}.json`);
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
  };
}

/** Save (create or update) an investigation to disk. */
export function saveInvestigation(
  storageDir: string,
  investigation: Investigation,
): Investigation {
  const dir = investigationsDir(storageDir);
  ensureDir(dir);
  const savedInvestigation: Investigation = {
    ...investigation,
    savedAt: new Date().toISOString(),
  };
  const envelope: StorageEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    investigation: savedInvestigation,
  };
  fs.writeFileSync(
    filePath(storageDir, investigation.id),
    JSON.stringify(envelope, null, 2),
    'utf-8',
  );
  return savedInvestigation;
}

/** Load a single investigation by id. Returns null if not found or unreadable. */
export function loadInvestigation(
  storageDir: string,
  id: string,
): Investigation | null {
  const fp = filePath(storageDir, id);
  if (!fs.existsSync(fp)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    const envelope = JSON.parse(raw) as StorageEnvelope | LegacyStorageEnvelope;
    if (typeof envelope.schemaVersion !== 'number' || !envelope.investigation) {
      return null;
    }

    if (envelope.schemaVersion === 1) {
      return migrateInvestigationV1(envelope.investigation as LegacyInvestigation);
    }

    if (envelope.schemaVersion !== SCHEMA_VERSION) {
      return null;
    }
    return envelope.investigation;
  } catch {
    return null;
  }
}

/** List all persisted investigations. Skips files that fail to parse. */
export function listInvestigations(storageDir: string): Investigation[] {
  const dir = investigationsDir(storageDir);
  if (!fs.existsSync(dir)) {
    return [];
  }
  const results: Investigation[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) {
      continue;
    }
    const id = entry.replace(/\.json$/, '');
    const inv = loadInvestigation(storageDir, id);
    if (inv) {
      results.push(inv);
    }
  }
  return results;
}

/** Delete an investigation from disk. Returns true if the file existed. */
export function deleteInvestigation(storageDir: string, id: string): boolean {
  const fp = filePath(storageDir, id);
  if (!fs.existsSync(fp)) {
    return false;
  }
  fs.unlinkSync(fp);
  return true;
}
