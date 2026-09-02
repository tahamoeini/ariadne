import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createInvestigation, createCheckpoint } from '../domain';
import {
  saveInvestigation,
  loadInvestigation,
  listInvestigations,
  deleteInvestigation,
  deleteAllInvestigations,
  SCHEMA_VERSION,
} from '../storage';

/** Create a temp directory for each test. */
function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'repotrail-test-'));
}

/** Remove a temp directory after test. */
function rmDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function readSavedJson(dir: string, id: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(path.join(dir, 'investigations', `${id}.json`), 'utf-8'),
  ) as Record<string, unknown>;
}

suite('Storage', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = makeTmpDir();
  });

  teardown(() => {
    rmDir(tmpDir);
  });

  suite('save and load', () => {
    test('round-trips an investigation', () => {
      const inv = createInvestigation('Persist me', '/ws');
      saveInvestigation(tmpDir, inv);
      const loaded = loadInvestigation(tmpDir, inv.id);
      assert.ok(loaded);
      assert.strictEqual(loaded!.id, inv.id);
      assert.strictEqual(loaded!.name, inv.name);
    });

    test('savedAt is updated on save', () => {
      const inv = createInvestigation('Time check', '/ws');
      const originalSavedAt = inv.savedAt;
      // tiny delay to ensure different timestamp
      saveInvestigation(tmpDir, inv);
      const loaded = loadInvestigation(tmpDir, inv.id);
      assert.ok(loaded);
      // savedAt should be at least as recent as originalSavedAt
      assert.ok(new Date(loaded!.savedAt).getTime() >= new Date(originalSavedAt).getTime());
    });

    test('preserves checkpoint', () => {
      const inv = createInvestigation('With CP', '/ws');
      inv.checkpoint = createCheckpoint('local note');
      saveInvestigation(tmpDir, inv);
      const loaded = loadInvestigation(tmpDir, inv.id);
      assert.ok(loaded);
      assert.strictEqual(loaded!.checkpoint!.text, 'local note');
    });

    test('preserves null checkpoint', () => {
      const inv = createInvestigation('No CP', '/ws');
      saveInvestigation(tmpDir, inv);
      const loaded = loadInvestigation(tmpDir, inv.id);
      assert.ok(loaded);
      assert.strictEqual(loaded!.checkpoint, null);
    });

    test('persists a minimized schema with workspace-relative file paths', () => {
      const inv = createInvestigation('Minimize me', '/ws', '/repo');
      inv.createdAt = '2026-01-01T00:00:00.000Z';
      inv.lastResumedAt = '2026-01-01T00:10:00.000Z';
      inv.checkpoint = {
        text: 'local note',
        createdAt: '2026-01-01T00:03:30.000Z',
      };
      inv.browserReferences = [
        {
          url: 'https://example.com/spec',
          title: 'Spec',
          capturedAt: '2026-01-01T00:03:45.000Z',
        },
      ];
      inv.snapshot.editedFiles = ['/ws/src/token.ts'];
      inv.snapshot.visitedFileCounts = {
        '/ws/src/token.ts': 3,
      };
      inv.snapshot.lastLocation = {
        filePath: '/ws/src/token.ts',
        line: 8,
        column: 2,
      };
      inv.snapshot.recentEvents = [
        {
          timestamp: '2026-01-01T00:02:00.000Z',
          type: 'editor.active',
          workspace: '/ws',
          repository: '/repo',
          filePath: '/ws/src/token.ts',
        },
        {
          timestamp: '2026-01-01T00:03:00.000Z',
          type: 'editor.active',
          workspace: '/ws',
          repository: '/repo',
          filePath: '/ws/src/helper.ts',
        },
      ];
      inv.snapshot.git = {
        timestamp: '2026-01-01T00:04:00.000Z',
        availability: 'available',
        repositoryRoot: '/repo',
        head: 'abc123',
        branch: 'main',
        modifiedFiles: ['src/token.ts'],
        untrackedFiles: ['notes.txt'],
        diffStats: { filesChanged: 1, insertions: 2, deletions: 1 },
      };
      inv.timeline = [
        {
          timestamp: '2026-01-01T00:02:00.000Z',
          type: 'file.transition',
          filePath: '/ws/src/token.ts',
        },
        {
          timestamp: '2026-01-01T00:03:00.000Z',
          type: 'file.transition',
          filePath: '/ws/src/helper.ts',
        },
        {
          timestamp: '2026-01-01T00:03:30.000Z',
          type: 'checkpoint',
          text: 'local note',
        },
        {
          timestamp: '2026-01-01T00:04:00.000Z',
          type: 'git.snapshot',
          availability: 'available',
          head: 'abc123',
          branch: 'main',
          modifiedCount: 1,
          untrackedCount: 1,
          filesChanged: 1,
          insertions: 2,
          deletions: 1,
        },
        {
          timestamp: '2026-01-01T00:04:01.000Z',
          type: 'save.point',
          reason: 'save',
        },
      ];
      inv.navigationGraph = {
        nodes: [
          {
            kind: 'file',
            filePath: '/ws/src/token.ts',
            visitCount: 2,
            editCount: 1,
            lastObservedAt: '2026-01-01T00:03:00.000Z',
          },
          {
            kind: 'file',
            filePath: '/ws/src/helper.ts',
            visitCount: 1,
            editCount: 0,
            lastObservedAt: '2026-01-01T00:02:30.000Z',
          },
        ],
        edges: [
          {
            fromFilePath: '/ws/src/helper.ts',
            toFilePath: '/ws/src/token.ts',
            relationship: 'transition',
            count: 1,
            lastObservedAt: '2026-01-01T00:03:00.000Z',
          },
        ],
      };

      saveInvestigation(tmpDir, inv);
      const savedJson = readSavedJson(tmpDir, inv.id);
      const investigation = savedJson.investigation as Record<string, unknown>;
      const navigationGraph = investigation.navigationGraph as Record<string, unknown>;
      const snapshot = investigation.snapshot as Record<string, unknown>;
      const git = snapshot.git as Record<string, unknown>;
      const timeline = investigation.timeline as Record<string, unknown>[];

      assert.strictEqual(savedJson.schemaVersion, SCHEMA_VERSION);
      assert.ok(!('createdAt' in investigation));
      assert.ok(!('lastResumedAt' in investigation));
      assert.deepStrictEqual(investigation.checkpoint, { text: 'local note' });
      assert.deepStrictEqual(investigation.browserReferences, [
        {
          url: 'https://example.com/spec',
          title: 'Spec',
          capturedAt: '2026-01-01T00:03:45.000Z',
        },
      ]);
      assert.deepStrictEqual(navigationGraph, {
        nodes: [
          {
            kind: 'file',
            filePath: 'src/token.ts',
            visitCount: 2,
            editCount: 1,
            lastObservedAt: '2026-01-01T00:03:00.000Z',
          },
          {
            kind: 'file',
            filePath: 'src/helper.ts',
            visitCount: 1,
            editCount: 0,
            lastObservedAt: '2026-01-01T00:02:30.000Z',
          },
        ],
        edges: [
          {
            fromFilePath: 'src/helper.ts',
            toFilePath: 'src/token.ts',
            relationship: 'transition',
            count: 1,
            lastObservedAt: '2026-01-01T00:03:00.000Z',
          },
        ],
      });
      assert.deepStrictEqual(timeline, [
        {
          timestamp: '2026-01-01T00:02:00.000Z',
          type: 'file.transition',
          filePath: 'src/token.ts',
        },
        {
          timestamp: '2026-01-01T00:03:00.000Z',
          type: 'file.transition',
          filePath: 'src/helper.ts',
        },
        {
          timestamp: '2026-01-01T00:03:30.000Z',
          type: 'checkpoint',
          text: 'local note',
        },
        {
          timestamp: '2026-01-01T00:04:00.000Z',
          type: 'git.snapshot',
          availability: 'available',
          head: 'abc123',
          branch: 'main',
          modifiedCount: 1,
          untrackedCount: 1,
          filesChanged: 1,
          insertions: 2,
          deletions: 1,
        },
        {
          timestamp: '2026-01-01T00:04:01.000Z',
          type: 'save.point',
          reason: 'save',
        },
      ]);
      assert.deepStrictEqual(snapshot.editedFiles, ['src/token.ts']);
      assert.deepStrictEqual(snapshot.visitedFileCounts, { 'src/token.ts': 3 });
      assert.deepStrictEqual(snapshot.lastLocation, {
        filePath: 'src/token.ts',
        line: 8,
        column: 2,
      });
      assert.deepStrictEqual(snapshot.recentPath, ['src/token.ts', 'src/helper.ts']);
      assert.ok(!('recentEvents' in snapshot));
      assert.ok(!('repositoryRoot' in git));
    });
  });

  suite('load edge cases', () => {
    test('returns null for non-existent id', () => {
      const loaded = loadInvestigation(tmpDir, 'no-such-id');
      assert.strictEqual(loaded, null);
    });

    test('returns null for malformed JSON', () => {
      const dir = path.join(tmpDir, 'investigations');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'bad.json'), '{{not json}}', 'utf-8');
      const loaded = loadInvestigation(tmpDir, 'bad');
      assert.strictEqual(loaded, null);
    });

    test('returns null for missing schemaVersion', () => {
      const dir = path.join(tmpDir, 'investigations');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'noversion.json'),
        JSON.stringify({ investigation: { id: 'noversion' } }),
        'utf-8',
      );
      const loaded = loadInvestigation(tmpDir, 'noversion');
      assert.strictEqual(loaded, null);
    });

    test('returns null for future schema version', () => {
      const dir = path.join(tmpDir, 'investigations');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'future.json'),
        JSON.stringify({ schemaVersion: 999, investigation: { id: 'future' } }),
        'utf-8',
      );
      const loaded = loadInvestigation(tmpDir, 'future');
      assert.strictEqual(loaded, null);
    });

    test('does not restore an older backup over a future-schema primary', () => {
      const dir = path.join(tmpDir, 'investigations');
      fs.mkdirSync(dir, { recursive: true });
      const primaryPath = path.join(dir, 'future-with-backup.json');
      const backupPath = `${primaryPath}.bak`;

      fs.writeFileSync(
        primaryPath,
        JSON.stringify({
          schemaVersion: 999,
          investigation: {
            id: 'future-with-backup',
            name: 'Future version',
          },
        }),
        'utf-8',
      );
      fs.writeFileSync(
        backupPath,
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          investigation: {
            id: 'future-with-backup',
            name: 'Older backup',
            workspace: '/ws',
            repository: null,
            savedAt: '2026-01-01T00:00:00.000Z',
            checkpoint: null,
            browserReferences: [],
            navigationGraph: { nodes: [], edges: [] },
            timeline: [],
            snapshot: {
              editedFiles: [],
              visitedFileCounts: {},
              lastLocation: null,
              recentPath: [],
              git: null,
            },
          },
        }),
        'utf-8',
      );

      const primaryBefore = fs.readFileSync(primaryPath, 'utf-8');
      const loaded = loadInvestigation(tmpDir, 'future-with-backup');

      assert.strictEqual(loaded, null);
      assert.strictEqual(fs.readFileSync(primaryPath, 'utf-8'), primaryBefore);
      assert.strictEqual(
        JSON.parse(fs.readFileSync(primaryPath, 'utf-8')).schemaVersion,
        999,
      );
      assert.ok(fs.existsSync(backupPath));
    });

    test('migrates legacy schema version 1 git snapshots', () => {
      const dir = path.join(tmpDir, 'investigations');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'legacy.json'),
        JSON.stringify({
          schemaVersion: 1,
          investigation: {
            id: 'legacy',
            name: 'Legacy',
            workspace: '/ws',
            repository: '/repo',
            createdAt: '2026-01-01T00:00:00.000Z',
            savedAt: '2026-01-01T00:00:00.000Z',
            lastResumedAt: null,
            checkpoint: null,
            snapshot: {
              editedFiles: [],
              visitedFileCounts: {},
              lastLocation: null,
              recentEvents: [],
              git: {
                timestamp: '2026-01-01T00:00:00.000Z',
                head: 'abc123',
                branch: 'main',
                modifiedFiles: ['src/index.ts'],
                untrackedFiles: ['notes with spaces.txt'],
                diffStats: { filesChanged: 1, insertions: 2, deletions: 1 },
              },
            },
          },
        }),
        'utf-8',
      );

      const loaded = loadInvestigation(tmpDir, 'legacy');
      assert.ok(loaded);
      assert.deepStrictEqual(loaded!.snapshot.git, {
        timestamp: '2026-01-01T00:00:00.000Z',
        availability: 'available',
        repositoryRoot: '/repo',
        head: 'abc123',
        branch: 'main',
        modifiedFiles: ['src/index.ts'],
        untrackedFiles: ['notes with spaces.txt'],
        diffStats: { filesChanged: 1, insertions: 2, deletions: 1 },
      });
    });

    test('returns null for envelope without investigation', () => {
      const dir = path.join(tmpDir, 'investigations');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'noinv.json'),
        JSON.stringify({ schemaVersion: SCHEMA_VERSION }),
        'utf-8',
      );
      const loaded = loadInvestigation(tmpDir, 'noinv');
      assert.strictEqual(loaded, null);
    });

    test('drops workspace-scoped absolute paths outside the saved workspace while preserving valid paths', () => {
      const dir = path.join(tmpDir, 'investigations');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'outside.json'),
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          investigation: {
            id: 'outside',
            name: 'Outside paths',
            workspace: '/ws',
            repository: '/repo',
            savedAt: '2026-01-01T00:00:00.000Z',
            checkpoint: null,
            browserReferences: [],
            navigationGraph: {
              nodes: [
                {
                  kind: 'file',
                  filePath: 'src/keep.ts',
                  visitCount: 1,
                  editCount: 0,
                  lastObservedAt: '2026-01-01T00:00:00.000Z',
                },
                {
                  kind: 'file',
                  filePath: '/outside/secret.ts',
                  visitCount: 1,
                  editCount: 1,
                  lastObservedAt: '2026-01-01T00:00:01.000Z',
                },
                {
                  kind: 'file',
                  filePath: 'C:/outside/win-secret.ts',
                  visitCount: 1,
                  editCount: 1,
                  lastObservedAt: '2026-01-01T00:00:02.000Z',
                },
              ],
              edges: [
                {
                  fromFilePath: 'src/keep.ts',
                  toFilePath: '/outside/secret.ts',
                  relationship: 'transition',
                  count: 1,
                  lastObservedAt: '2026-01-01T00:00:01.000Z',
                },
              ],
            },
            timeline: [
              {
                timestamp: '2026-01-01T00:00:00.000Z',
                type: 'file.transition',
                filePath: 'src/keep.ts',
              },
              {
                timestamp: '2026-01-01T00:00:01.000Z',
                type: 'file.edit',
                filePath: '/outside/secret.ts',
                count: 1,
              },
              {
                timestamp: '2026-01-01T00:00:02.000Z',
                type: 'file.edit',
                filePath: 'C:/outside/win-secret.ts',
                count: 1,
              },
            ],
            snapshot: {
              editedFiles: ['src/keep.ts', '/outside/secret.ts', 'C:/outside/win-secret.ts'],
              visitedFileCounts: {
                'src/keep.ts': 3,
                '/outside/secret.ts': 2,
                'C:/outside/win-secret.ts': 4,
              },
              lastLocation: {
                filePath: '/outside/secret.ts',
                line: 8,
                column: 2,
              },
              recentPath: ['src/keep.ts', '/outside/secret.ts', 'C:/outside/win-secret.ts'],
              git: null,
            },
          },
        }),
        'utf-8',
      );

      const loaded = loadInvestigation(tmpDir, 'outside');
      assert.ok(loaded);
      assert.deepStrictEqual(loaded!.snapshot.editedFiles, ['/ws/src/keep.ts']);
      assert.deepStrictEqual(loaded!.snapshot.visitedFileCounts, {
        '/ws/src/keep.ts': 3,
      });
      assert.strictEqual(loaded!.snapshot.lastLocation, null);
      assert.deepStrictEqual(
        loaded!.snapshot.recentEvents.map((event) => event.filePath),
        ['/ws/src/keep.ts'],
      );
      assert.deepStrictEqual(loaded!.timeline, [
        {
          timestamp: '2026-01-01T00:00:00.000Z',
          type: 'file.transition',
          filePath: '/ws/src/keep.ts',
        },
      ]);
      assert.deepStrictEqual(loaded!.navigationGraph, {
        nodes: [
          {
            kind: 'file',
            filePath: '/ws/src/keep.ts',
            visitCount: 1,
            editCount: 0,
            lastObservedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        edges: [],
      });
    });

    test('drops parent-traversal workspace paths while preserving valid paths', () => {
      const dir = path.join(tmpDir, 'investigations');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'traversal.json'),
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          investigation: {
            id: 'traversal',
            name: 'Traversal paths',
            workspace: '/ws',
            repository: null,
            savedAt: '2026-01-01T00:00:00.000Z',
            checkpoint: null,
            browserReferences: [],
            navigationGraph: {
              nodes: [
                {
                  kind: 'file',
                  filePath: '../secret.ts',
                  visitCount: 1,
                  editCount: 1,
                  lastObservedAt: '2026-01-01T00:00:01.000Z',
                },
                {
                  kind: 'file',
                  filePath: 'src/keep.ts',
                  visitCount: 2,
                  editCount: 1,
                  lastObservedAt: '2026-01-01T00:00:02.000Z',
                },
              ],
              edges: [
                {
                  fromFilePath: '../secret.ts',
                  toFilePath: 'src/keep.ts',
                  relationship: 'transition',
                  count: 1,
                  lastObservedAt: '2026-01-01T00:00:02.000Z',
                },
              ],
            },
            timeline: [
              {
                timestamp: '2026-01-01T00:00:01.000Z',
                type: 'file.transition',
                filePath: '../secret.ts',
              },
              {
                timestamp: '2026-01-01T00:00:02.000Z',
                type: 'file.edit',
                filePath: 'src/keep.ts',
                count: 1,
              },
            ],
            snapshot: {
              editedFiles: ['../secret.ts', 'src/keep.ts'],
              visitedFileCounts: {
                '../secret.ts': 2,
                'src/keep.ts': 1,
              },
              lastLocation: {
                filePath: '../secret.ts',
                line: 2,
                column: 3,
              },
              recentPath: ['../secret.ts', 'src/keep.ts'],
              git: null,
            },
          },
        }),
        'utf-8',
      );

      const loaded = loadInvestigation(tmpDir, 'traversal');
      assert.ok(loaded);
      assert.deepStrictEqual(loaded!.snapshot.editedFiles, ['/ws/src/keep.ts']);
      assert.deepStrictEqual(loaded!.snapshot.visitedFileCounts, {
        '/ws/src/keep.ts': 1,
      });
      assert.strictEqual(loaded!.snapshot.lastLocation, null);
      assert.deepStrictEqual(
        loaded!.snapshot.recentEvents.map((event) => event.filePath),
        ['/ws/src/keep.ts'],
      );
      assert.deepStrictEqual(loaded!.timeline, [
        {
          timestamp: '2026-01-01T00:00:02.000Z',
          type: 'file.edit',
          filePath: '/ws/src/keep.ts',
          count: 1,
        },
      ]);
      assert.deepStrictEqual(loaded!.navigationGraph, {
        nodes: [
          {
            kind: 'file',
            filePath: '/ws/src/keep.ts',
            visitCount: 2,
            editCount: 1,
            lastObservedAt: '2026-01-01T00:00:02.000Z',
          },
        ],
        edges: [],
      });
    });

    test('drops timeline and navigation entries with invalid timestamps', () => {
      const dir = path.join(tmpDir, 'investigations');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'bad-timestamps.json'),
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          investigation: {
            id: 'bad-timestamps',
            name: 'Bad timestamps',
            workspace: '/ws',
            repository: null,
            savedAt: '2026-01-01T00:00:00.000Z',
            checkpoint: null,
            browserReferences: [],
            navigationGraph: {
              nodes: [
                {
                  kind: 'file',
                  filePath: 'src/good.ts',
                  visitCount: 1,
                  editCount: 0,
                  lastObservedAt: '2026-01-01T00:00:00.000Z',
                },
                {
                  kind: 'file',
                  filePath: 'src/bad.ts',
                  visitCount: 2,
                  editCount: 1,
                  lastObservedAt: 'not-a-date',
                },
              ],
              edges: [
                {
                  fromFilePath: 'src/good.ts',
                  toFilePath: 'src/bad.ts',
                  relationship: 'transition',
                  count: 1,
                  lastObservedAt: 'still-not-a-date',
                },
              ],
            },
            timeline: [
              {
                timestamp: '2026-01-01T00:00:00.000Z',
                type: 'file.transition',
                filePath: 'src/good.ts',
              },
              {
                timestamp: 'not-a-date',
                type: 'file.edit',
                filePath: 'src/bad.ts',
                count: 1,
              },
            ],
            snapshot: {
              editedFiles: ['src/good.ts'],
              visitedFileCounts: { 'src/good.ts': 1 },
              lastLocation: { filePath: 'src/good.ts', line: 2, column: 1 },
              recentPath: ['src/good.ts'],
              git: null,
            },
          },
        }),
        'utf-8',
      );

      const loaded = loadInvestigation(tmpDir, 'bad-timestamps');
      assert.ok(loaded);
      assert.deepStrictEqual(loaded!.timeline, [
        {
          timestamp: '2026-01-01T00:00:00.000Z',
          type: 'file.transition',
          filePath: '/ws/src/good.ts',
        },
      ]);
      assert.deepStrictEqual(loaded!.navigationGraph, {
        nodes: [
          {
            kind: 'file',
            filePath: '/ws/src/good.ts',
            visitCount: 1,
            editCount: 0,
            lastObservedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        edges: [],
      });
    });

    test('reconstructs runtime paths from schema version 3 storage', () => {
      const dir = path.join(tmpDir, 'investigations');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'v3.json'),
        JSON.stringify({
          schemaVersion: 3,
          investigation: {
            id: 'v3',
            name: 'Schema 3',
            workspace: '/ws',
            repository: '/repo',
            savedAt: '2026-01-01T00:00:00.000Z',
            checkpoint: { text: 'remember this' },
            snapshot: {
              editedFiles: ['src/token.ts'],
              visitedFileCounts: { 'src/token.ts': 2 },
              lastLocation: { filePath: 'src/token.ts', line: 9, column: 4 },
              recentPath: ['src/helper.ts', 'src/token.ts'],
              git: {
                timestamp: '2026-01-01T00:00:00.000Z',
                availability: 'available',
                head: 'abc123',
                branch: 'main',
                modifiedFiles: ['src/token.ts'],
                untrackedFiles: [],
                diffStats: { filesChanged: 1, insertions: 2, deletions: 1 },
              },
            },
          },
        }),
        'utf-8',
      );

      const loaded = loadInvestigation(tmpDir, 'v3');
      assert.ok(loaded);
      assert.deepStrictEqual(loaded!.snapshot.editedFiles, ['/ws/src/token.ts']);
      assert.deepStrictEqual(loaded!.snapshot.visitedFileCounts, { '/ws/src/token.ts': 2 });
      assert.deepStrictEqual(loaded!.snapshot.lastLocation, {
        filePath: '/ws/src/token.ts',
        line: 9,
        column: 4,
      });
      assert.deepStrictEqual(
        loaded!.snapshot.recentEvents.map((event) => event.filePath),
        ['/ws/src/helper.ts', '/ws/src/token.ts'],
      );
      assert.strictEqual(loaded!.checkpoint?.createdAt, '2026-01-01T00:00:00.000Z');
      assert.strictEqual(loaded!.snapshot.git?.repositoryRoot, '/repo');
      assert.deepStrictEqual(loaded!.navigationGraph, {
        nodes: [
          {
            kind: 'file',
            filePath: '/ws/src/helper.ts',
            visitCount: 1,
            editCount: 0,
            lastObservedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            kind: 'file',
            filePath: '/ws/src/token.ts',
            visitCount: 1,
            editCount: 0,
            lastObservedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        edges: [
          {
            fromFilePath: '/ws/src/helper.ts',
            toFilePath: '/ws/src/token.ts',
            relationship: 'transition',
            count: 1,
            lastObservedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });
      assert.deepStrictEqual(loaded!.timeline.map((entry) => entry.type), [
        'file.transition',
        'file.transition',
        'checkpoint',
        'git.snapshot',
        'save.point',
      ]);
    });

    test('derives a navigation graph from schema version 4 storage', () => {
      const dir = path.join(tmpDir, 'investigations');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'v4.json'),
        JSON.stringify({
          schemaVersion: 4,
          investigation: {
            id: 'v4',
            name: 'Schema 4',
            workspace: '/ws',
            repository: '/repo',
            savedAt: '2026-01-01T00:00:00.000Z',
            checkpoint: null,
            timeline: [
              {
                timestamp: '2026-01-01T00:00:00.000Z',
                type: 'file.transition',
                filePath: 'src/a.ts',
              },
              {
                timestamp: '2026-01-01T00:00:10.000Z',
                type: 'file.transition',
                filePath: 'src/b.ts',
              },
              {
                timestamp: '2026-01-01T00:00:11.000Z',
                type: 'file.edit',
                filePath: 'src/b.ts',
                count: 2,
              },
            ],
            snapshot: {
              editedFiles: ['src/b.ts'],
              visitedFileCounts: { 'src/a.ts': 1, 'src/b.ts': 1 },
              lastLocation: { filePath: 'src/b.ts', line: 3, column: 2 },
              recentPath: ['src/a.ts', 'src/b.ts'],
              git: null,
            },
          },
        }),
        'utf-8',
      );

      const loaded = loadInvestigation(tmpDir, 'v4');
      assert.ok(loaded);
      assert.deepStrictEqual(loaded!.navigationGraph, {
        nodes: [
          {
            kind: 'file',
            filePath: '/ws/src/a.ts',
            visitCount: 1,
            editCount: 0,
            lastObservedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            kind: 'file',
            filePath: '/ws/src/b.ts',
            visitCount: 1,
            editCount: 2,
            lastObservedAt: '2026-01-01T00:00:11.000Z',
          },
        ],
        edges: [
          {
            fromFilePath: '/ws/src/a.ts',
            toFilePath: '/ws/src/b.ts',
            relationship: 'transition',
            count: 1,
            lastObservedAt: '2026-01-01T00:00:10.000Z',
          },
        ],
      });
    });

    test('recovers from a valid backup when the primary file is malformed', () => {
      const inv = createInvestigation('Recover me', '/ws', '/repo');
      saveInvestigation(tmpDir, inv);
      inv.checkpoint = createCheckpoint('latest version');
      saveInvestigation(tmpDir, inv);

      const dir = path.join(tmpDir, 'investigations');
      const primaryPath = path.join(dir, `${inv.id}.json`);
      const backupPath = `${primaryPath}.bak`;
      assert.ok(fs.existsSync(backupPath));
      fs.writeFileSync(primaryPath, '{broken json', 'utf-8');

      const loaded = loadInvestigation(tmpDir, inv.id);
      assert.ok(loaded);
      assert.strictEqual(loaded!.id, inv.id);
      assert.strictEqual(loaded!.checkpoint, null);

      const restored = JSON.parse(fs.readFileSync(primaryPath, 'utf-8')) as Record<string, unknown>;
      assert.strictEqual(restored.schemaVersion, SCHEMA_VERSION);
    });
  });

  suite('listInvestigations', () => {
    test('returns empty array for empty storage', () => {
      const list = listInvestigations(tmpDir);
      assert.deepStrictEqual(list, []);
    });

    test('lists all saved investigations', () => {
      const a = createInvestigation('A', '/ws');
      const b = createInvestigation('B', '/ws');
      saveInvestigation(tmpDir, a);
      saveInvestigation(tmpDir, b);
      const list = listInvestigations(tmpDir);
      assert.strictEqual(list.length, 2);
      const names = list.map((i) => i.name).sort();
      assert.deepStrictEqual(names, ['A', 'B']);
    });

    test('skips malformed files', () => {
      const inv = createInvestigation('Good', '/ws');
      saveInvestigation(tmpDir, inv);
      const dir = path.join(tmpDir, 'investigations');
      fs.writeFileSync(path.join(dir, 'broken.json'), 'nope', 'utf-8');
      const list = listInvestigations(tmpDir);
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].name, 'Good');
    });
  });

  suite('deleteInvestigation', () => {
    test('deletes an existing investigation', () => {
      const inv = createInvestigation('Delete me', '/ws');
      saveInvestigation(tmpDir, inv);
      const deleted = deleteInvestigation(tmpDir, inv.id);
      assert.strictEqual(deleted, true);
      const loaded = loadInvestigation(tmpDir, inv.id);
      assert.strictEqual(loaded, null);
    });

    test('returns false for non-existent id', () => {
      const deleted = deleteInvestigation(tmpDir, 'no-such');
      assert.strictEqual(deleted, false);
    });

    test('deleteAllInvestigations removes the full storage directory', () => {
      const first = createInvestigation('A', '/ws');
      const second = createInvestigation('B', '/ws');
      saveInvestigation(tmpDir, first);
      saveInvestigation(tmpDir, second);

      const deletedCount = deleteAllInvestigations(tmpDir);

      assert.strictEqual(deletedCount, 2);
      assert.ok(!fs.existsSync(tmpDir));
    });
  });

  suite('update', () => {
    test('overwrites investigation on re-save', () => {
      const inv = createInvestigation('Original', '/ws');
      saveInvestigation(tmpDir, inv);
      inv.name = 'Updated';
      saveInvestigation(tmpDir, inv);
      const loaded = loadInvestigation(tmpDir, inv.id);
      assert.ok(loaded);
      assert.strictEqual(loaded!.name, 'Updated');
      assert.strictEqual(listInvestigations(tmpDir).length, 1);
    });
  });
});
