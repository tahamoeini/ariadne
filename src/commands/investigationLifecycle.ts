import { DEFAULT_EVENT_BUFFER_MAX_EVENTS } from '../capture/eventBuffer';
import {
  Checkpoint,
  FileLocation,
  GitSnapshot,
  Investigation,
  InvestigationCaptureProfile,
  ObservedEvent,
  Snapshot,
  createInvestigation,
} from '../domain';
import { captureGitSnapshot } from '../git';
import {
  deleteAllInvestigations as deleteAllStoredInvestigations,
  deleteInvestigation as deleteStoredInvestigation,
  listInvestigations as listStoredInvestigations,
  loadInvestigation,
  saveInvestigation,
} from '../storage';
import {
  DEFAULT_INVESTIGATION_CAPTURE_PROFILE,
  applyCaptureProfileToCheckpoint,
  applyCaptureProfileToSnapshot,
  captureProfileIncludesGit,
  captureProfileIncludesTrail,
  normalizeInvestigationCaptureProfile,
} from '../validation';

const ACTIVE_INVESTIGATIONS_KEY = 'repotrail.activeInvestigations';
export const MAX_INVESTIGATION_NAME_LENGTH = 120;
export const MAX_CHECKPOINT_LENGTH = 1000;

const VISIT_EVENT_TYPES: ReadonlySet<ObservedEvent['type']> = new Set([
  'editor.active',
  'navigation.definition',
  'navigation.reference',
]);

export interface InvestigationLifecycleCapture {
  getRecentEvents(workspace?: string): ObservedEvent[];
  getLastLocation(workspace?: string): FileLocation | null;
}

export interface InvestigationLifecycleStateStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

export interface InvestigationLifecycleOptions {
  storageDir: string;
  capture: InvestigationLifecycleCapture;
  stateStore: InvestigationLifecycleStateStore;
  captureGitSnapshot?: (targetPath: string) => GitSnapshot;
}

export interface CreateInvestigationOptions {
  workspace: string;
  name: string;
  checkpointText?: string | null;
  captureProfile?: InvestigationCaptureProfile;
}

export interface InvestigationLifecycleDebugApi {
  getActiveInvestigation(workspace?: string): Investigation | null;
  listInvestigations(): Investigation[];
  clearInvestigations(): Promise<void>;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'string');
}

function cloneLocation(location: FileLocation | null): FileLocation | null {
  return location ? { ...location } : null;
}

function cloneCheckpoint(checkpoint: Checkpoint | null): Checkpoint | null {
  return checkpoint ? { ...checkpoint } : null;
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

function cloneSnapshot(snapshot: Snapshot): Snapshot {
  return {
    editedFiles: [...snapshot.editedFiles],
    visitedFileCounts: { ...snapshot.visitedFileCounts },
    lastLocation: cloneLocation(snapshot.lastLocation),
    recentEvents: snapshot.recentEvents.map(cloneObservedEvent),
    git: cloneGitSnapshot(snapshot.git),
  };
}

function cloneInvestigation(investigation: Investigation): Investigation {
  return {
    ...investigation,
    checkpoint: cloneCheckpoint(investigation.checkpoint),
    snapshot: cloneSnapshot(investigation.snapshot),
  };
}

function trimToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requireBoundedText(
  value: string | null | undefined,
  fieldName: string,
  maxLength: number,
): string {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }

  return trimmed;
}

function optionalBoundedText(
  value: string | null | undefined,
  fieldName: string,
  maxLength: number,
): string | null {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }

  return trimmed;
}

function createCheckpoint(text: string): Checkpoint {
  return {
    text,
    createdAt: new Date().toISOString(),
  };
}

function appendEditedFile(editedFiles: string[], filePath: string | undefined): string[] {
  if (!filePath || editedFiles.includes(filePath)) {
    return editedFiles;
  }

  return [...editedFiles, filePath];
}

function trimRecentEvents(events: ObservedEvent[]): ObservedEvent[] {
  if (events.length <= DEFAULT_EVENT_BUFFER_MAX_EVENTS) {
    return events;
  }

  return events.slice(-DEFAULT_EVENT_BUFFER_MAX_EVENTS);
}

function inferRepositoryFromEvents(events: ObservedEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].repository) {
      return events[index].repository;
    }
  }

  return null;
}

function resolveRepository(snapshot: Snapshot, fallback: string | null): string | null {
  return snapshot.git?.repositoryRoot ?? inferRepositoryFromEvents(snapshot.recentEvents) ?? fallback;
}

function compareInvestigations(a: Investigation, b: Investigation): number {
  return Date.parse(b.savedAt) - Date.parse(a.savedAt);
}

export function buildSnapshotFromObservedEvents(
  events: ObservedEvent[],
  git: GitSnapshot | null,
  lastLocation: FileLocation | null,
): Snapshot {
  const visitedFileCounts: Record<string, number> = {};
  const editedFiles: string[] = [];

  for (const event of events) {
    if (event.filePath && VISIT_EVENT_TYPES.has(event.type)) {
      visitedFileCounts[event.filePath] = (visitedFileCounts[event.filePath] ?? 0) + 1;
    }

    if (event.type === 'file.edit' && event.filePath && !editedFiles.includes(event.filePath)) {
      editedFiles.push(event.filePath);
    }
  }

  return {
    editedFiles: Array.from(new Set(editedFiles)),
    visitedFileCounts,
    lastLocation: cloneLocation(lastLocation),
    recentEvents: trimRecentEvents(events.map(cloneObservedEvent)),
    git: cloneGitSnapshot(git),
  };
}

export function applyObservedEventToSnapshot(
  snapshot: Snapshot,
  event: ObservedEvent,
): Snapshot {
  const nextVisitedFileCounts = { ...snapshot.visitedFileCounts };
  if (event.filePath && VISIT_EVENT_TYPES.has(event.type)) {
    nextVisitedFileCounts[event.filePath] = (nextVisitedFileCounts[event.filePath] ?? 0) + 1;
  }

  const nextEditedFiles =
    event.type === 'file.edit'
      ? appendEditedFile(snapshot.editedFiles, event.filePath)
      : [...snapshot.editedFiles];

  return {
    ...cloneSnapshot(snapshot),
    editedFiles: nextEditedFiles,
    visitedFileCounts: nextVisitedFileCounts,
    lastLocation: event.location ? { ...event.location } : cloneLocation(snapshot.lastLocation),
    recentEvents: trimRecentEvents([
      ...snapshot.recentEvents.map(cloneObservedEvent),
      cloneObservedEvent(event),
    ]),
  };
}

export class InvestigationLifecycleService implements InvestigationLifecycleDebugApi {
  private readonly activeInvestigations = new Map<string, Investigation>();
  private readonly captureGitSnapshotForTarget: (targetPath: string) => GitSnapshot;

  constructor(private readonly options: InvestigationLifecycleOptions) {
    this.captureGitSnapshotForTarget = options.captureGitSnapshot ?? captureGitSnapshot;
    this.restoreActiveInvestigations();
  }

  getActiveInvestigation(workspace?: string): Investigation | null {
    if (workspace) {
      const investigation = this.activeInvestigations.get(workspace);
      return investigation ? cloneInvestigation(investigation) : null;
    }

    const investigation = this.activeInvestigations.values().next().value;
    return investigation ? cloneInvestigation(investigation) : null;
  }

  listInvestigations(): Investigation[] {
    return listStoredInvestigations(this.options.storageDir)
      .sort(compareInvestigations)
      .map(cloneInvestigation);
  }

  async clearInvestigations(): Promise<void> {
    await this.deleteAllData();
  }

  async persistActiveInvestigations(): Promise<void> {
    for (const workspace of Array.from(this.activeInvestigations.keys())) {
      const investigation = this.activeInvestigations.get(workspace);
      if (!investigation) {
        continue;
      }

      await this.persistActiveInvestigation(investigation);
    }
  }

  getStorageDirectory(): string {
    return this.options.storageDir;
  }

  async deleteAllData(): Promise<number> {
    const deletedCount = deleteAllStoredInvestigations(this.options.storageDir);
    this.activeInvestigations.clear();
    await this.persistActiveInvestigationIds();
    return deletedCount;
  }

  recordObservedEvent(event: ObservedEvent): void {
    const active = this.activeInvestigations.get(event.workspace);
    if (!active) {
      return;
    }

    if (!captureProfileIncludesTrail(active.captureProfile)) {
      return;
    }

    const snapshot = applyObservedEventToSnapshot(active.snapshot, event);
    this.activeInvestigations.set(event.workspace, {
      ...cloneInvestigation(active),
      repository: resolveRepository(snapshot, active.repository ?? event.repository),
      snapshot,
    });
  }

  async startInvestigation(options: CreateInvestigationOptions): Promise<Investigation> {
    const investigation = await this.createAndActivateInvestigation(options, false);
    if (!investigation) {
      throw new Error('Investigation could not be created.');
    }

    return investigation;
  }

  async saveRecentActivityAsInvestigation(
    options: CreateInvestigationOptions,
  ): Promise<Investigation | null> {
    return this.createAndActivateInvestigation(options, true);
  }

  async updateCheckpoint(
    workspace: string,
    checkpointText: string | null,
  ): Promise<Investigation | null> {
    const active = this.activeInvestigations.get(workspace);
    if (!active) {
      return null;
    }

    const nextCheckpointText = optionalBoundedText(
      checkpointText,
      'Checkpoint',
      MAX_CHECKPOINT_LENGTH,
    );
    const updated: Investigation = {
      ...cloneInvestigation(active),
      checkpoint: nextCheckpointText ? createCheckpoint(nextCheckpointText) : null,
    };

    return this.persistActiveInvestigation(updated);
  }

  async saveAndStopInvestigation(workspace: string): Promise<Investigation | null> {
    const active = this.activeInvestigations.get(workspace);
    if (!active) {
      return null;
    }

    const saved = await this.persistActiveInvestigation(active);
    const persistedActive = this.activeInvestigations.get(workspace);
    if (!persistedActive) {
      throw new Error('Active investigation state was lost before stopping.');
    }

    this.activeInvestigations.delete(workspace);
    try {
      await this.persistActiveInvestigationIds();
    } catch (error) {
      this.activeInvestigations.set(workspace, cloneInvestigation(persistedActive));
      throw error;
    }
    return saved;
  }

  async deleteInvestigation(id: string): Promise<boolean> {
    const deleted = deleteStoredInvestigation(this.options.storageDir, id);
    if (!deleted) {
      return false;
    }

    for (const [workspace, investigation] of this.activeInvestigations.entries()) {
      if (investigation.id === id) {
        this.activeInvestigations.delete(workspace);
      }
    }

    await this.persistActiveInvestigationIds();
    return true;
  }

  private async createAndActivateInvestigation(
    options: CreateInvestigationOptions,
    requireRecentActivity: boolean,
  ): Promise<Investigation | null> {
    const workspace = options.workspace;
    if (this.activeInvestigations.has(workspace)) {
      throw new Error('An investigation is already active in this workspace.');
    }

    const name = requireBoundedText(
      options.name,
      'Investigation name',
      MAX_INVESTIGATION_NAME_LENGTH,
    );

    const captureProfile = normalizeInvestigationCaptureProfile(
      options.captureProfile ?? DEFAULT_INVESTIGATION_CAPTURE_PROFILE,
    );
    const seedSnapshot = this.buildSeedSnapshot(workspace, captureProfile);
    if (requireRecentActivity && seedSnapshot.recentEvents.length === 0) {
      return null;
    }

    const checkpointText = optionalBoundedText(
      options.checkpointText,
      'Checkpoint',
      MAX_CHECKPOINT_LENGTH,
    );
    const snapshot = applyCaptureProfileToSnapshot(seedSnapshot, captureProfile);
    const repository = resolveRepository(snapshot, null);
    const investigation: Investigation = {
      ...createInvestigation(name, workspace, repository, captureProfile),
      checkpoint: applyCaptureProfileToCheckpoint(
        checkpointText ? createCheckpoint(checkpointText) : null,
        captureProfile,
      ),
      repository,
      snapshot,
    };

    const saved = saveInvestigation(this.options.storageDir, investigation);
    this.activeInvestigations.set(workspace, cloneInvestigation(saved));
    await this.persistActiveInvestigationIds();
    return cloneInvestigation(saved);
  }

  private buildSeedSnapshot(workspace: string, captureProfile: InvestigationCaptureProfile): Snapshot {
    const recentEvents = this.options.capture.getRecentEvents(workspace);
    const lastLocation = this.options.capture.getLastLocation(workspace);
    const git = captureProfileIncludesGit(captureProfile)
      ? this.captureGitSnapshotForTarget(lastLocation?.filePath ?? workspace)
      : null;
    return buildSnapshotFromObservedEvents(recentEvents, git, lastLocation);
  }

  private refreshSnapshot(investigation: Investigation): Snapshot {
    const captureProfile = normalizeInvestigationCaptureProfile(investigation.captureProfile);
    const currentLastLocation =
      this.options.capture.getLastLocation(investigation.workspace) ?? investigation.snapshot.lastLocation;
    const git = captureProfileIncludesGit(captureProfile)
      ? this.captureGitSnapshotForTarget(currentLastLocation?.filePath ?? investigation.workspace)
      : null;

    return applyCaptureProfileToSnapshot(
      {
        ...cloneSnapshot(investigation.snapshot),
        lastLocation: cloneLocation(currentLastLocation),
        git: cloneGitSnapshot(git),
        recentEvents: trimRecentEvents(investigation.snapshot.recentEvents.map(cloneObservedEvent)),
      },
      captureProfile,
    );
  }

  private restoreActiveInvestigations(): void {
    const rawActiveInvestigationIds = this.options.stateStore.get<unknown>(ACTIVE_INVESTIGATIONS_KEY);
    const activeInvestigationIds = isStringRecord(rawActiveInvestigationIds)
      ? rawActiveInvestigationIds
      : {};

    for (const [workspace, investigationId] of Object.entries(activeInvestigationIds)) {
      const investigation = loadInvestigation(this.options.storageDir, investigationId);
      if (investigation && investigation.workspace === workspace) {
        this.activeInvestigations.set(workspace, cloneInvestigation(investigation));
      }
    }
  }

  private async persistActiveInvestigation(investigation: Investigation): Promise<Investigation> {
    const captureProfile = normalizeInvestigationCaptureProfile(investigation.captureProfile);
    const snapshot = this.refreshSnapshot(investigation);
    const saved = saveInvestigation(this.options.storageDir, {
      ...cloneInvestigation(investigation),
      captureProfile,
      checkpoint: applyCaptureProfileToCheckpoint(
        cloneCheckpoint(investigation.checkpoint),
        captureProfile,
      ),
      repository: resolveRepository(snapshot, investigation.repository),
      snapshot,
    });

    this.activeInvestigations.set(investigation.workspace, cloneInvestigation(saved));
    await this.persistActiveInvestigationIds();
    return cloneInvestigation(saved);
  }

  private async persistActiveInvestigationIds(): Promise<void> {
    const nextValue: Record<string, string> = {};
    for (const [workspace, investigation] of this.activeInvestigations.entries()) {
      nextValue[workspace] = investigation.id;
    }

    await this.options.stateStore.update(ACTIVE_INVESTIGATIONS_KEY, nextValue);
  }
}
