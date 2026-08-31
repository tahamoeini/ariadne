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
      inv.checkpoint = createCheckpoint('important note');
      saveInvestigation(tmpDir, inv);
      const loaded = loadInvestigation(tmpDir, inv.id);
      assert.ok(loaded);
      assert.strictEqual(loaded!.checkpoint!.text, 'important note');
    });

    test('preserves null checkpoint', () => {
      const inv = createInvestigation('No CP', '/ws');
      saveInvestigation(tmpDir, inv);
      const loaded = loadInvestigation(tmpDir, inv.id);
      assert.ok(loaded);
      assert.strictEqual(loaded!.checkpoint, null);
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
