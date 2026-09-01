/**
 * Factory functions for domain objects.
 */

import * as crypto from 'crypto';
import {
  Investigation,
  Snapshot,
  Checkpoint,
  InvestigationCaptureProfile,
} from './types';

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
  captureProfile: InvestigationCaptureProfile = 'standard',
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
    captureProfile,
    checkpoint: null,
    snapshot: createEmptySnapshot(),
  };
}

/** Create a Checkpoint. */
export function createCheckpoint(text: string): Checkpoint {
  return {
    text,
    createdAt: new Date().toISOString(),
  };
}
