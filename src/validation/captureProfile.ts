import {
  Checkpoint,
  FileLocation,
  GitSnapshot,
  InvestigationCaptureProfile,
  ObservedEvent,
  Snapshot,
} from '../domain';

export const DEFAULT_INVESTIGATION_CAPTURE_PROFILE: InvestigationCaptureProfile = 'standard';

export interface InvestigationCapturePolicy {
  id: InvestigationCaptureProfile;
  includeCheckpoint: boolean;
  includeGit: boolean;
  includeTrail: boolean;
}

const CAPTURE_POLICIES: Record<InvestigationCaptureProfile, InvestigationCapturePolicy> = {
  standard: {
    id: 'standard',
    includeCheckpoint: true,
    includeGit: true,
    includeTrail: true,
  },
  'checkpoint-only': {
    id: 'checkpoint-only',
    includeCheckpoint: true,
    includeGit: false,
    includeTrail: false,
  },
  'checkpoint-git': {
    id: 'checkpoint-git',
    includeCheckpoint: true,
    includeGit: true,
    includeTrail: false,
  },
  'git-trail': {
    id: 'git-trail',
    includeCheckpoint: false,
    includeGit: true,
    includeTrail: true,
  },
};

function cloneLocation(location: FileLocation | null): FileLocation | null {
  return location ? { ...location } : null;
}

function cloneObservedEvent(event: ObservedEvent): ObservedEvent {
  return {
    ...event,
    location: event.location ? { ...event.location } : undefined,
    source: event.source ? { ...event.source } : undefined,
  };
}

function cloneGitSnapshot(git: GitSnapshot | null): GitSnapshot | null {
  if (!git) {
    return null;
  }

  return {
    ...git,
    modifiedFiles: [...git.modifiedFiles],
    untrackedFiles: [...git.untrackedFiles],
    diffStats: { ...git.diffStats },
  };
}

export function normalizeInvestigationCaptureProfile(
  value: unknown,
): InvestigationCaptureProfile {
  return typeof value === 'string' && value in CAPTURE_POLICIES
    ? (value as InvestigationCaptureProfile)
    : DEFAULT_INVESTIGATION_CAPTURE_PROFILE;
}

export function getInvestigationCapturePolicy(
  profile: InvestigationCaptureProfile,
): InvestigationCapturePolicy {
  return CAPTURE_POLICIES[normalizeInvestigationCaptureProfile(profile)];
}

export function captureProfileAllowsCheckpoint(profile: InvestigationCaptureProfile): boolean {
  return getInvestigationCapturePolicy(profile).includeCheckpoint;
}

export function captureProfileIncludesGit(profile: InvestigationCaptureProfile): boolean {
  return getInvestigationCapturePolicy(profile).includeGit;
}

export function captureProfileIncludesTrail(profile: InvestigationCaptureProfile): boolean {
  return getInvestigationCapturePolicy(profile).includeTrail;
}

export function applyCaptureProfileToCheckpoint(
  checkpoint: Checkpoint | null,
  profile: InvestigationCaptureProfile,
): Checkpoint | null {
  if (!captureProfileAllowsCheckpoint(profile)) {
    return null;
  }

  return checkpoint ? { ...checkpoint } : null;
}

export function applyCaptureProfileToSnapshot(
  snapshot: Snapshot,
  profile: InvestigationCaptureProfile,
): Snapshot {
  const policy = getInvestigationCapturePolicy(profile);

  return {
    editedFiles: policy.includeTrail ? [...snapshot.editedFiles] : [],
    visitedFileCounts: policy.includeTrail ? { ...snapshot.visitedFileCounts } : {},
    lastLocation: policy.includeTrail ? cloneLocation(snapshot.lastLocation) : null,
    recentEvents: policy.includeTrail ? snapshot.recentEvents.map(cloneObservedEvent) : [],
    git: policy.includeGit ? cloneGitSnapshot(snapshot.git) : null,
  };
}
