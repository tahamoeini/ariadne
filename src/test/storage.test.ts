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
      assert.strictEqual(loaded!.captureProfile, 'standard');
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
      inv.checkpoint = createCheckpoint('local note');
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

      saveInvestigation(tmpDir, inv);
      const savedJson = readSavedJson(tmpDir, inv.id);
      const investigation = savedJson.investigation as Record<string, unknown>;
      const snapshot = investigation.snapshot as Record<string, unknown>;
      const git = snapshot.git as Record<string, unknown>;

      assert.strictEqual(savedJson.schemaVersion, SCHEMA_VERSION);
      assert.ok(!('createdAt' in investigation));
      assert.ok(!('lastResumedAt' in investigation));
      assert.strictEqual(investigation.captureProfile, 'standard');
      assert.deepStrictEqual(investigation.checkpoint, { text: 'local note' });
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
      assert.strictEqual(loaded!.captureProfile, 'standard');
      assert.strictEqual(loaded!.checkpoint?.createdAt, '2026-01-01T00:00:00.000Z');
      assert.strictEqual(loaded!.snapshot.git?.repositoryRoot, '/repo');
    });

    test('preserves an explicit capture profile', () => {
      const inv = createInvestigation('Variant D', '/ws', '/repo', 'git-trail');
      saveInvestigation(tmpDir, inv);

      const loaded = loadInvestigation(tmpDir, inv.id);

      assert.ok(loaded);
      assert.strictEqual(loaded!.captureProfile, 'git-trail');
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
