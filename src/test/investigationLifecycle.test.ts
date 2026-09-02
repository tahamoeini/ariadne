import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileLocation, GitSnapshot, ObservedEvent } from '../domain';
import {
  InvestigationLifecycleCapture,
  InvestigationLifecycleService,
  InvestigationLifecycleStateStore,
  MAX_CHECKPOINT_LENGTH,
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
  private nextError: Error | null = null;

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  rejectNextUpdate(error: Error): void {
    this.nextError = error;
  }

  update(key: string, value: unknown): Promise<void> {
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      return Promise.reject(error);
    }

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
    assert.deepStrictEqual(created.navigationGraph, {
      nodes: [
        {
          kind: 'file',
          filePath: tokenServiceFile,
          visitCount: 1,
          editCount: 1,
          lastObservedAt: '2026-05-01T10:00:30.000Z',
        },
      ],
      edges: [],
    });
    assert.deepStrictEqual(created.timeline.map((entry) => entry.type), [
      'file.transition',
      'file.edit',
      'git.snapshot',
      'save.point',
    ]);
    assert.deepStrictEqual(created.timeline.at(-1), {
      timestamp: created.savedAt,
      type: 'save.point',
      reason: 'start',
    });
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
    assert.deepStrictEqual(saved!.navigationGraph, {
      nodes: [
        {
          kind: 'file',
          filePath: tokenServiceFile,
          visitCount: 1,
          editCount: 1,
          lastObservedAt: '2026-05-01T10:00:30.000Z',
        },
        {
          kind: 'file',
          filePath: authTestFile,
          visitCount: 1,
          editCount: 1,
          lastObservedAt: '2026-05-01T10:03:00.000Z',
        },
      ],
      edges: [
        {
          fromFilePath: tokenServiceFile,
          toFilePath: authTestFile,
          relationship: 'transition',
          count: 1,
          lastObservedAt: '2026-05-01T10:03:00.000Z',
        },
      ],
    });
    assert.deepStrictEqual(saved!.timeline.map((entry) => entry.type), [
      'file.transition',
      'file.edit',
      'git.snapshot',
      'save.point',
      'file.transition',
      'file.edit',
      'git.snapshot',
      'save.point',
    ]);
    assert.deepStrictEqual(saved!.timeline.at(-1), {
      timestamp: saved!.savedAt,
      type: 'save.point',
      reason: 'save-stop',
    });
    assert.strictEqual(service.getActiveInvestigation(workspace), null);

    const loaded = loadInvestigation(tmpDir, created.id);
    assert.ok(loaded);
    assert.strictEqual(loaded!.snapshot.git?.head, 'def456');
    assert.deepStrictEqual(loaded!.snapshot.editedFiles, [tokenServiceFile, authTestFile]);
  });

  test('attaches deliberate browser references to the active investigation', async () => {
    const workspace = '/workspace';
    const capture = new FakeCapture();
    const stateStore = new FakeStateStore();

    const service = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture,
      stateStore,
      captureGitSnapshot: () => makeGitSnapshot(),
    });

    const created = await service.startInvestigation({
      workspace,
      name: 'Attach docs',
      checkpointText: null,
    });

    const firstAttach = await service.attachBrowserReference(workspace, {
      url: 'https://developer.mozilla.org/docs/Web/API/URL',
      title: 'MDN URL',
    });

    assert.ok(firstAttach);
    assert.strictEqual(firstAttach!.browserReferences.length, 1);
    assert.strictEqual(
      firstAttach!.browserReferences[0].url,
      'https://developer.mozilla.org/docs/Web/API/URL',
    );
    assert.strictEqual(firstAttach!.browserReferences[0].title, 'MDN URL');

    const secondAttach = await service.attachBrowserReference(workspace, {
      url: 'https://developer.mozilla.org/docs/Web/API/URL',
      title: null,
    });

    assert.ok(secondAttach);
    assert.strictEqual(secondAttach!.browserReferences.length, 1);
    assert.strictEqual(secondAttach!.browserReferences[0].title, 'MDN URL');
    assert.ok(
      Date.parse(secondAttach!.browserReferences[0].capturedAt) >=
        Date.parse(firstAttach!.browserReferences[0].capturedAt),
    );

    const loaded = loadInvestigation(tmpDir, created.id);
    assert.ok(loaded);
    assert.strictEqual(loaded!.browserReferences.length, 1);
    assert.strictEqual(loaded!.browserReferences[0].title, 'MDN URL');
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
    assert.deepStrictEqual(created!.navigationGraph, {
      nodes: [
        {
          kind: 'file',
          filePath: authControllerFile,
          visitCount: 1,
          editCount: 0,
          lastObservedAt: '2026-05-01T11:00:00.000Z',
        },
        {
          kind: 'file',
          filePath: tokenServiceFile,
          visitCount: 1,
          editCount: 1,
          lastObservedAt: '2026-05-01T11:01:00.000Z',
        },
      ],
      edges: [
        {
          fromFilePath: authControllerFile,
          toFilePath: tokenServiceFile,
          relationship: 'transition',
          count: 1,
          lastObservedAt: '2026-05-01T11:00:15.000Z',
        },
      ],
    });
    assert.deepStrictEqual(created!.timeline.map((entry) => entry.type), [
      'file.transition',
      'file.transition',
      'file.edit',
      'checkpoint',
      'git.snapshot',
      'save.point',
    ]);
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

  test('persists active investigation progress without stopping it', async () => {
    const workspace = '/workspace';
    const firstFile = '/workspace/src/start.ts';
    const secondFile = '/workspace/src/continue.ts';
    const capture = new FakeCapture();
    const stateStore = new FakeStateStore();

    capture.setEvents(workspace, [
      makeEvent(
        'editor.active',
        workspace,
        firstFile,
        '2026-05-01T13:30:00.000Z',
        2,
        1,
      ),
    ]);

    const gitSnapshots = [
      makeGitSnapshot({
        timestamp: '2026-05-01T13:30:00.000Z',
        head: 'before-flush',
        modifiedFiles: ['src/start.ts'],
      }),
      makeGitSnapshot({
        timestamp: '2026-05-01T13:35:00.000Z',
        head: 'after-flush',
        modifiedFiles: ['src/start.ts', 'src/continue.ts'],
        diffStats: { filesChanged: 2, insertions: 5, deletions: 1 },
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
      name: 'Persist active progress',
      checkpointText: null,
    });

    const followUpEdit = makeEvent(
      'file.edit',
      workspace,
      secondFile,
      '2026-05-01T13:34:00.000Z',
      7,
      3,
    );
    capture.addEvent(followUpEdit);
    service.recordObservedEvent(followUpEdit);

    await service.persistActiveInvestigations();

    assert.strictEqual(service.getActiveInvestigation(workspace)?.id, created.id);
    assert.strictEqual(
      service.getActiveInvestigation(workspace)?.snapshot.lastLocation?.filePath,
      secondFile,
    );
    assert.strictEqual(service.getActiveInvestigation(workspace)?.snapshot.git?.head, 'after-flush');

    const loaded = loadInvestigation(tmpDir, created.id);
    assert.ok(loaded);
    assert.deepStrictEqual(loaded!.snapshot.editedFiles, [secondFile]);
    assert.strictEqual(loaded!.snapshot.lastLocation?.filePath, secondFile);
    assert.strictEqual(loaded!.snapshot.git?.head, 'after-flush');
  });

  test('autosaves active investigation after observed activity', async () => {
    const workspace = '/workspace';
    const firstFile = '/workspace/src/seed.ts';
    const secondFile = '/workspace/src/auto.ts';
    const capture = new FakeCapture();
    const stateStore = new FakeStateStore();

    capture.setEvents(workspace, [
      makeEvent(
        'editor.active',
        workspace,
        firstFile,
        '2026-05-01T13:30:00.000Z',
        2,
        1,
      ),
    ]);

    const gitSnapshots = [
      makeGitSnapshot({
        timestamp: '2026-05-01T13:30:00.000Z',
        head: 'start',
        modifiedFiles: ['src/seed.ts'],
      }),
      makeGitSnapshot({
        timestamp: '2026-05-01T13:31:00.000Z',
        head: 'auto-saved',
        modifiedFiles: ['src/seed.ts', 'src/auto.ts'],
        diffStats: { filesChanged: 2, insertions: 4, deletions: 1 },
      }),
    ];
    let gitSnapshotIndex = 0;

    const service = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture,
      stateStore,
      captureGitSnapshot: () => gitSnapshots[Math.min(gitSnapshotIndex++, gitSnapshots.length - 1)],
      autoSaveDebounceMs: 5,
    });

    const created = await service.startInvestigation({
      workspace,
      name: 'Autosave active progress',
      checkpointText: null,
    });

    const followUpEdit = makeEvent(
      'file.edit',
      workspace,
      secondFile,
      '2026-05-01T13:30:30.000Z',
      8,
      4,
    );
    capture.addEvent(followUpEdit);
    service.recordObservedEvent(followUpEdit);

    await new Promise((resolve) => setTimeout(resolve, 30));

    const loaded = loadInvestigation(tmpDir, created.id);
    assert.ok(loaded);
    assert.deepStrictEqual(loaded!.snapshot.editedFiles, [secondFile]);
    assert.strictEqual(loaded!.snapshot.lastLocation?.filePath, secondFile);
    assert.strictEqual(loaded!.snapshot.git?.head, 'auto-saved');
    assert.strictEqual(loaded!.timeline.at(-1)?.type, 'save.point');
    assert.deepStrictEqual(loaded!.timeline.at(-1), {
      timestamp: loaded!.savedAt,
      type: 'save.point',
      reason: 'save',
    });

    service.dispose();
  });

  test('collapses consecutive edit noise into one timeline entry', async () => {
    const workspace = '/workspace';
    const filePath = '/workspace/src/timeline.ts';
    const capture = new FakeCapture();

    const service = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture,
      stateStore: new FakeStateStore(),
      captureGitSnapshot: () => makeGitSnapshot(),
    });

    await service.startInvestigation({
      workspace,
      name: 'Collapse edit noise',
      checkpointText: null,
    });

    const firstEdit = makeEvent(
      'file.edit',
      workspace,
      filePath,
      '2026-05-01T15:00:00.000Z',
      5,
      1,
    );
    const secondEdit = makeEvent(
      'file.edit',
      workspace,
      filePath,
      '2026-05-01T15:00:10.000Z',
      5,
      2,
    );

    capture.addEvent(firstEdit);
    capture.addEvent(secondEdit);
    service.recordObservedEvent(firstEdit);
    service.recordObservedEvent(secondEdit);

    const active = service.getActiveInvestigation(workspace);
    assert.ok(active);
    const editEntries = active!.timeline.filter((entry) => entry.type === 'file.edit');
    assert.strictEqual(editEntries.length, 1);
    assert.deepStrictEqual(editEntries[0], {
      timestamp: '2026-05-01T15:00:10.000Z',
      type: 'file.edit',
      filePath,
      count: 2,
    });
  });

  test('marks a resume point without changing the saved timestamp', async () => {
    const workspace = '/workspace';
    const filePath = '/workspace/src/resume.ts';
    const capture = new FakeCapture();

    capture.setEvents(workspace, [
      makeEvent(
        'editor.active',
        workspace,
        filePath,
        '2026-05-01T16:00:00.000Z',
        7,
        1,
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
      name: 'Resume marker',
      checkpointText: null,
    });
    const stopped = await service.saveAndStopInvestigation(workspace);
    assert.ok(stopped);

    const resumed = await service.markInvestigationResumed(created.id);
    assert.ok(resumed);
    assert.strictEqual(resumed!.savedAt, stopped!.savedAt);
    assert.strictEqual(resumed!.timeline.at(-1)?.type, 'resume.point');
    assert.strictEqual(service.getActiveInvestigation(workspace)?.id, created.id);

    const loaded = loadInvestigation(tmpDir, created.id);
    assert.ok(loaded);
    assert.strictEqual(loaded!.savedAt, stopped!.savedAt);
    assert.strictEqual(loaded!.timeline.at(-1)?.type, 'resume.point');
  });

  test('resumes a stopped investigation into active tracking and accepts follow-up updates', async () => {
    const workspace = '/workspace';
    const firstFile = '/workspace/src/first.ts';
    const secondFile = '/workspace/src/second.ts';
    const capture = new FakeCapture();
    const stateStore = new FakeStateStore();

    capture.setEvents(workspace, [
      makeEvent(
        'editor.active',
        workspace,
        firstFile,
        '2026-05-01T17:00:00.000Z',
        5,
        2,
      ),
      makeEvent(
        'file.edit',
        workspace,
        firstFile,
        '2026-05-01T17:00:30.000Z',
        5,
        2,
      ),
    ]);

    const service = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture,
      stateStore,
      captureGitSnapshot: () => makeGitSnapshot(),
    });

    const created = await service.startInvestigation({
      workspace,
      name: 'Resume into active tracking',
      checkpointText: null,
    });

    const stopped = await service.saveAndStopInvestigation(workspace);
    assert.ok(stopped);
    assert.strictEqual(service.getActiveInvestigation(workspace), null);

    const resumed = await service.markInvestigationResumed(created.id);
    assert.ok(resumed);
    assert.strictEqual(resumed!.id, created.id);
    assert.strictEqual(resumed!.savedAt, stopped!.savedAt);
    assert.strictEqual(service.getActiveInvestigation(workspace)?.id, created.id);

    const updatedCheckpoint = await service.updateCheckpoint(
      workspace,
      'Continue from the resumed state.',
    );
    assert.strictEqual(updatedCheckpoint?.checkpoint?.text, 'Continue from the resumed state.');

    const attached = await service.attachBrowserReference(workspace, {
      url: 'https://example.com/resume-context',
      title: 'Resume context',
    });
    assert.ok(attached);
    assert.strictEqual(attached!.browserReferences.length, 1);

    const resumedEdit = makeEvent(
      'file.edit',
      workspace,
      secondFile,
      '2026-05-01T17:02:00.000Z',
      8,
      1,
    );
    capture.addEvent(resumedEdit);
    service.recordObservedEvent(resumedEdit);

    const active = service.getActiveInvestigation(workspace);
    assert.ok(active);
    assert.deepStrictEqual(active!.snapshot.editedFiles, [firstFile, secondFile]);
    assert.strictEqual(active!.snapshot.lastLocation?.filePath, secondFile);
    assert.ok(active!.timeline.some((entry) => entry.type === 'resume.point'));
    assert.strictEqual(active!.timeline.at(-1)?.type, 'file.edit');
  });

  test('rejects resuming a saved investigation when another investigation is active in the workspace', async () => {
    const workspace = '/workspace';
    const firstFile = '/workspace/src/one.ts';
    const secondFile = '/workspace/src/two.ts';
    const capture = new FakeCapture();

    capture.setEvents(workspace, [
      makeEvent(
        'editor.active',
        workspace,
        firstFile,
        '2026-05-01T18:00:00.000Z',
        1,
        1,
      ),
    ]);

    const service = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture,
      stateStore: new FakeStateStore(),
      captureGitSnapshot: () => makeGitSnapshot(),
    });

    const saved = await service.startInvestigation({
      workspace,
      name: 'Saved investigation',
      checkpointText: null,
    });
    await service.saveAndStopInvestigation(workspace);

    capture.setEvents(workspace, [
      makeEvent(
        'editor.active',
        workspace,
        secondFile,
        '2026-05-01T18:05:00.000Z',
        2,
        1,
      ),
    ]);

    const active = await service.startInvestigation({
      workspace,
      name: 'Current active investigation',
      checkpointText: null,
    });

    await assert.rejects(
      async () => {
        await service.markInvestigationResumed(saved.id);
      },
      /already active in this workspace/,
    );

    assert.strictEqual(service.getActiveInvestigation(workspace)?.id, active.id);
  });

  test('keeps an investigation active if workspace-state persistence fails while stopping', async () => {
    const workspace = '/workspace';
    const filePath = '/workspace/src/index.ts';
    const capture = new FakeCapture();
    const stateStore = new FakeStateStore();
    capture.setEvents(workspace, [
      makeEvent(
        'editor.active',
        workspace,
        filePath,
        '2026-05-01T13:40:00.000Z',
        3,
        1,
      ),
    ]);

    const service = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture,
      stateStore,
      captureGitSnapshot: () => makeGitSnapshot(),
    });

    const created = await service.startInvestigation({
      workspace,
      name: 'Stop failure rollback',
      checkpointText: null,
    });

    stateStore.rejectNextUpdate(new Error('workspaceState unavailable'));

    await assert.rejects(
      async () => {
        await service.saveAndStopInvestigation(workspace);
      },
      /workspaceState unavailable/,
    );

    assert.strictEqual(service.getActiveInvestigation(workspace)?.id, created.id);
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

  test('deletes all saved data and clears restart state', async () => {
    const workspace = '/workspace';
    const filePath = '/workspace/src/delete-all.ts';
    const capture = new FakeCapture();
    const stateStore = new FakeStateStore();
    capture.setEvents(workspace, [
      makeEvent(
        'editor.active',
        workspace,
        filePath,
        '2026-05-01T15:00:00.000Z',
        2,
        1,
      ),
    ]);

    const service = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture,
      stateStore,
      captureGitSnapshot: () => makeGitSnapshot(),
    });

    const created = await service.startInvestigation({
      workspace,
      name: 'Delete all data',
      checkpointText: null,
    });

    const deletedCount = await service.deleteAllData();

    assert.strictEqual(deletedCount, 1);
    assert.strictEqual(service.getActiveInvestigation(workspace), null);
    assert.deepStrictEqual(service.listInvestigations(), []);
    assert.strictEqual(loadInvestigation(tmpDir, created.id), null);
    assert.deepStrictEqual(
      stateStore.get<Record<string, string>>('repotrail.activeInvestigations'),
      {},
    );
  });

  test('ignores malformed active-investigation state during restoration', async () => {
    const workspace = '/workspace';
    const stateStore = new FakeStateStore();
    await stateStore.update('repotrail.activeInvestigations', 42);

    const service = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture: new FakeCapture(),
      stateStore,
      captureGitSnapshot: () => makeGitSnapshot(),
    });

    assert.strictEqual(service.getActiveInvestigation(workspace), null);
    assert.deepStrictEqual(service.listInvestigations(), []);
  });

  test('rejects oversized checkpoints before persisting them', async () => {
    const workspace = '/workspace';
    const filePath = '/workspace/src/checkpoint.ts';
    const capture = new FakeCapture();
    capture.setEvents(workspace, [
      makeEvent(
        'editor.active',
        workspace,
        filePath,
        '2026-05-01T16:00:00.000Z',
        1,
        1,
      ),
    ]);

    const service = new InvestigationLifecycleService({
      storageDir: tmpDir,
      capture,
      stateStore: new FakeStateStore(),
      captureGitSnapshot: () => makeGitSnapshot(),
    });

    await assert.rejects(
      () =>
        service.startInvestigation({
          workspace,
          name: 'Checkpoint limit',
          checkpointText: 'x'.repeat(MAX_CHECKPOINT_LENGTH + 1),
        }),
      /Checkpoint must be 1000 characters or fewer\./,
    );
    assert.deepStrictEqual(service.listInvestigations(), []);
  });
});
