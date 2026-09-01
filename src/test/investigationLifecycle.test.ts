import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileLocation, GitSnapshot, ObservedEvent } from '../domain';
import {
  InvestigationLifecycleCapture,
  InvestigationLifecycleService,
  InvestigationLifecycleStateStore,
} from '../commands/investigationLifecycle';
import { loadInvestigation } from '../storage';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'repotrail-lifecycle-test-'));
}

function rmDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

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

class FakeCapture implements InvestigationLifecycleCapture {
  private readonly events = new Map<string, ObservedEvent[]>();
  private readonly lastLocations = new Map<string, FileLocation | null>();

  setEvents(workspace: string, events: ObservedEvent[]): void {
    this.events.set(workspace, events.map(cloneObservedEvent));
    const lastLocation =
      [...events].reverse().find((event) => event.location)?.location ?? null;
    this.lastLocations.set(workspace, cloneLocation(lastLocation));
  }

  addEvent(event: ObservedEvent): void {
    const existing = this.events.get(event.workspace) ?? [];
    existing.push(cloneObservedEvent(event));
    this.events.set(event.workspace, existing);
    if (event.location) {
      this.lastLocations.set(event.workspace, { ...event.location });
    }
  }

  getRecentEvents(workspace?: string): ObservedEvent[] {
    if (workspace) {
      return (this.events.get(workspace) ?? []).map(cloneObservedEvent);
    }

    return Array.from(this.events.values())
      .flat()
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .map(cloneObservedEvent);
  }

  getLastLocation(workspace?: string): FileLocation | null {
    if (workspace) {
      return cloneLocation(this.lastLocations.get(workspace) ?? null);
    }

    const lastLocation =
      this.getRecentEvents().reverse().find((event) => event.location)?.location ?? null;
    return cloneLocation(lastLocation);
  }
}

class FakeStateStore implements InvestigationLifecycleStateStore {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

function makeGitSnapshot(overrides: Partial<GitSnapshot> = {}): GitSnapshot {
  return {
    timestamp: '2026-05-01T00:00:00.000Z',
    availability: 'available',
    repositoryRoot: '/repo',
    head: 'abc123',
    branch: 'main',
    modifiedFiles: ['src/tokenService.ts'],
    untrackedFiles: [],
    diffStats: { filesChanged: 1, insertions: 2, deletions: 1 },
    ...overrides,
  };
}

function makeEvent(
  type: ObservedEvent['type'],
  workspace: string,
  filePath: string,
  timestamp: string,
  line: number,
  column: number,
  repository: string | null = '/repo',
): ObservedEvent {
  return {
    timestamp,
    type,
    workspace,
    repository,
    filePath,
    location: {
      filePath,
      line,
      column,
    },
    source: { languageId: 'typescript' },
  };
}

suite('Investigation Lifecycle', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = makeTmpDir();
  });

  teardown(() => {
    rmDir(tmpDir);
  });

  test('creates, tracks, saves, and stops an explicit investigation', async () => {
    const workspace = '/workspace';
    const tokenServiceFile = '/workspace/src/tokenService.ts';
    const authTestFile = '/workspace/src/auth.test.ts';
    const capture = new FakeCapture();
    const stateStore = new FakeStateStore();

    capture.setEvents(workspace, [
      makeEvent(
        'editor.active',
        workspace,
        tokenServiceFile,
        '2026-05-01T10:00:00.000Z',
        8,
        3,
      ),
      makeEvent(
        'file.edit',
        workspace,
        tokenServiceFile,
        '2026-05-01T10:00:30.000Z',
        8,
        3,
      ),
    ]);

    const gitSnapshots = [
      makeGitSnapshot({
        timestamp: '2026-05-01T10:00:31.000Z',
        head: 'abc123',
        modifiedFiles: ['src/tokenService.ts'],
      }),
      makeGitSnapshot({
        timestamp: '2026-05-01T10:05:00.000Z',
        head: 'def456',
        modifiedFiles: ['src/tokenService.ts', 'src/auth.test.ts'],
        diffStats: { filesChanged: 2, insertions: 7, deletions: 1 },
      }),
    ];
    let gitSnapshotIndex = 0;

    const service = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture,
      stateStore,
      captureGitSnapshot: () => gitSnapshots[Math.min(gitSnapshotIndex++, gitSnapshots.length - 1)],
    });

    const created = await service.startInvestigation({
      workspace,
      name: 'Investigate token race',
      checkpointText: null,
    });

    assert.strictEqual(created.name, 'Investigate token race');
    assert.strictEqual(created.checkpoint, null);
    assert.strictEqual(created.repository, '/repo');
    assert.deepStrictEqual(created.snapshot.editedFiles, [tokenServiceFile]);
    assert.deepStrictEqual(created.snapshot.visitedFileCounts, { [tokenServiceFile]: 1 });
    assert.strictEqual(created.snapshot.lastLocation?.line, 8);
    assert.strictEqual(service.getActiveInvestigation(workspace)?.id, created.id);

    const revisit = makeEvent(
      'editor.active',
      workspace,
      tokenServiceFile,
      '2026-05-01T10:02:00.000Z',
      12,
      4,
    );
    const editSecondFile = makeEvent(
      'file.edit',
      workspace,
      authTestFile,
      '2026-05-01T10:03:00.000Z',
      4,
      2,
    );
    capture.addEvent(revisit);
    capture.addEvent(editSecondFile);
    service.recordObservedEvent(revisit);
    service.recordObservedEvent(editSecondFile);

    const saved = await service.saveAndStopInvestigation(workspace);
    assert.ok(saved);
    assert.strictEqual(saved!.snapshot.git?.head, 'def456');
    assert.deepStrictEqual(saved!.snapshot.editedFiles, [tokenServiceFile, authTestFile]);
    assert.deepStrictEqual(saved!.snapshot.visitedFileCounts, { [tokenServiceFile]: 2 });
    assert.strictEqual(saved!.snapshot.lastLocation?.filePath, authTestFile);
    assert.strictEqual(service.getActiveInvestigation(workspace), null);

    const loaded = loadInvestigation(tmpDir, created.id);
    assert.ok(loaded);
    assert.strictEqual(loaded!.snapshot.git?.head, 'def456');
    assert.deepStrictEqual(loaded!.snapshot.editedFiles, [tokenServiceFile, authTestFile]);
  });

  test('creates a retroactive investigation from buffered activity with a checkpoint', async () => {
    const workspace = '/workspace';
    const authControllerFile = '/workspace/src/authController.ts';
    const tokenServiceFile = '/workspace/src/tokenService.ts';
    const capture = new FakeCapture();
    const stateStore = new FakeStateStore();

    capture.setEvents(workspace, [
      makeEvent(
        'editor.active',
        workspace,
        authControllerFile,
        '2026-05-01T11:00:00.000Z',
        3,
        1,
      ),
      makeEvent(
        'editor.active',
        workspace,
        tokenServiceFile,
        '2026-05-01T11:00:15.000Z',
        19,
        8,
      ),
      makeEvent(
        'file.edit',
        workspace,
        tokenServiceFile,
        '2026-05-01T11:01:00.000Z',
        24,
        3,
      ),
    ]);

    const service = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture,
      stateStore,
      captureGitSnapshot: () =>
        makeGitSnapshot({
          timestamp: '2026-05-01T11:01:01.000Z',
          modifiedFiles: ['src/tokenService.ts'],
        }),
    });

    const created = await service.saveRecentActivityAsInvestigation({
      workspace,
      name: 'Save recent auth activity',
      checkpointText: 'Check the delayed retry path next.',
    });

    assert.ok(created);
    assert.strictEqual(created!.checkpoint?.text, 'Check the delayed retry path next.');
    assert.deepStrictEqual(created!.snapshot.editedFiles, [tokenServiceFile]);
    assert.deepStrictEqual(created!.snapshot.visitedFileCounts, {
      [authControllerFile]: 1,
      [tokenServiceFile]: 1,
    });
    assert.strictEqual(created!.snapshot.recentEvents.length, 3);
  });

  test('does not create a retroactive investigation when the rolling buffer is empty', async () => {
    const workspace = '/workspace';
    const service = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture: new FakeCapture(),
      stateStore: new FakeStateStore(),
      captureGitSnapshot: () => makeGitSnapshot(),
    });

    const created = await service.saveRecentActivityAsInvestigation({
      workspace,
      name: 'Nothing here',
      checkpointText: null,
    });

    assert.strictEqual(created, null);
    assert.deepStrictEqual(service.listInvestigations(), []);
    assert.strictEqual(service.getActiveInvestigation(workspace), null);
  });

  test('captures an explicit no-git state', async () => {
    const workspace = '/workspace';
    const readmeFile = '/workspace/README.md';
    const capture = new FakeCapture();
    capture.setEvents(workspace, [
      makeEvent(
        'editor.active',
        workspace,
        readmeFile,
        '2026-05-01T12:00:00.000Z',
        1,
        1,
        null,
      ),
    ]);

    const service = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture,
      stateStore: new FakeStateStore(),
      captureGitSnapshot: () =>
        makeGitSnapshot({
          availability: 'not-repository',
          repositoryRoot: null,
          head: null,
          branch: null,
          modifiedFiles: [],
          untrackedFiles: [],
          diffStats: { filesChanged: 0, insertions: 0, deletions: 0 },
        }),
    });

    const created = await service.startInvestigation({
      workspace,
      name: 'Read docs',
      checkpointText: null,
    });

    assert.strictEqual(created.repository, null);
    assert.strictEqual(created.snapshot.git?.availability, 'not-repository');
    assert.strictEqual(created.snapshot.git?.repositoryRoot, null);
  });

  test('restores the active investigation after an extension restart', async () => {
    const workspace = '/workspace';
    const filePath = '/workspace/src/index.ts';
    const capture = new FakeCapture();
    const stateStore = new FakeStateStore();
    capture.setEvents(workspace, [
      makeEvent(
        'editor.active',
        workspace,
        filePath,
        '2026-05-01T13:00:00.000Z',
        5,
        1,
      ),
    ]);

    const firstService = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture,
      stateStore,
      captureGitSnapshot: () => makeGitSnapshot(),
    });

    const created = await firstService.startInvestigation({
      workspace,
      name: 'Restart-safe investigation',
      checkpointText: 'Resume after restart.',
    });

    const restartedService = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture,
      stateStore,
      captureGitSnapshot: () => makeGitSnapshot({ head: 'after-restart' }),
    });

    assert.strictEqual(restartedService.getActiveInvestigation(workspace)?.id, created.id);
    assert.strictEqual(restartedService.listInvestigations().length, 1);

    const saved = await restartedService.saveAndStopInvestigation(workspace);
    assert.ok(saved);
    assert.strictEqual(saved!.snapshot.git?.head, 'after-restart');
    assert.strictEqual(restartedService.getActiveInvestigation(workspace), null);
  });

  test('deletes a saved investigation', async () => {
    const workspace = '/workspace';
    const filePath = '/workspace/src/delete-me.ts';
    const capture = new FakeCapture();
    capture.setEvents(workspace, [
      makeEvent(
        'editor.active',
        workspace,
        filePath,
        '2026-05-01T14:00:00.000Z',
        2,
        5,
      ),
    ]);

    const service = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture,
      stateStore: new FakeStateStore(),
      captureGitSnapshot: () => makeGitSnapshot(),
    });

    const created = await service.startInvestigation({
      workspace,
      name: 'Delete me',
      checkpointText: null,
    });

    const deleted = await service.deleteInvestigation(created.id);
    assert.strictEqual(deleted, true);
    assert.deepStrictEqual(service.listInvestigations(), []);
    assert.strictEqual(service.getActiveInvestigation(workspace), null);
    assert.strictEqual(loadInvestigation(tmpDir, created.id), null);
  });
});
