import * as assert from 'assert';
import {
  appendObservedEventToNavigationGraph,
  buildNavigationGraphFromObservedEvents,
  createInvestigation,
  createCheckpoint,
  createEmptyNavigationGraph,
  createEmptySnapshot,
} from '../domain';
import type { Investigation } from '../domain';

suite('Domain Model', () => {
  suite('createInvestigation', () => {
    test('creates an investigation with required fields', () => {
      const inv = createInvestigation('Bug hunt', '/workspace');
      assert.ok(inv.id, 'should have an id');
      assert.strictEqual(inv.name, 'Bug hunt');
      assert.strictEqual(inv.workspace, '/workspace');
      assert.strictEqual(inv.repository, null);
      assert.ok(inv.createdAt);
      assert.ok(inv.savedAt);
      assert.strictEqual(inv.lastResumedAt, null);
      assert.strictEqual(inv.checkpoint, null);
      assert.deepStrictEqual(inv.snapshot.editedFiles, []);
      assert.deepStrictEqual(inv.snapshot.visitedFileCounts, {});
      assert.strictEqual(inv.snapshot.lastLocation, null);
      assert.deepStrictEqual(inv.snapshot.recentEvents, []);
      assert.strictEqual(inv.snapshot.git, null);
      assert.deepStrictEqual(inv.navigationGraph, { nodes: [], edges: [] });
      assert.deepStrictEqual(inv.timeline, []);
    });

    test('accepts optional repository path', () => {
      const inv = createInvestigation('Fix', '/ws', '/ws/repo');
      assert.strictEqual(inv.repository, '/ws/repo');
    });

    test('generates unique ids', () => {
      const a = createInvestigation('A', '/ws');
      const b = createInvestigation('B', '/ws');
      assert.notStrictEqual(a.id, b.id);
    });
  });

  suite('createCheckpoint', () => {
    test('creates a checkpoint with text and timestamp', () => {
      const cp = createCheckpoint('Looking at auth flow');
      assert.strictEqual(cp.text, 'Looking at auth flow');
      assert.ok(cp.createdAt);
    });
  });

  suite('createEmptySnapshot', () => {
    test('returns a blank snapshot', () => {
      const s = createEmptySnapshot();
      assert.deepStrictEqual(s.editedFiles, []);
      assert.deepStrictEqual(s.visitedFileCounts, {});
      assert.strictEqual(s.lastLocation, null);
      assert.deepStrictEqual(s.recentEvents, []);
      assert.strictEqual(s.git, null);
    });
  });

  suite('createEmptyNavigationGraph', () => {
    test('returns a blank graph', () => {
      const graph = createEmptyNavigationGraph();
      assert.deepStrictEqual(graph, { nodes: [], edges: [] });
    });
  });

  suite('navigation graph', () => {
    test('collapses observed movement into factual nodes and edges', () => {
      const graph = buildNavigationGraphFromObservedEvents([
        {
          timestamp: '2026-01-01T00:00:00.000Z',
          type: 'editor.active',
          workspace: '/ws',
          repository: '/repo',
          filePath: '/ws/src/a.ts',
        },
        {
          timestamp: '2026-01-01T00:00:10.000Z',
          type: 'navigation.definition',
          workspace: '/ws',
          repository: '/repo',
          filePath: '/ws/src/b.ts',
        },
        {
          timestamp: '2026-01-01T00:00:11.000Z',
          type: 'file.edit',
          workspace: '/ws',
          repository: '/repo',
          filePath: '/ws/src/b.ts',
        },
        {
          timestamp: '2026-01-01T00:00:20.000Z',
          type: 'editor.active',
          workspace: '/ws',
          repository: '/repo',
          filePath: '/ws/src/c.ts',
        },
        {
          timestamp: '2026-01-01T00:00:21.000Z',
          type: 'file.edit',
          workspace: '/ws',
          repository: '/repo',
          filePath: '/ws/src/c.ts',
        },
        {
          timestamp: '2026-01-01T00:00:22.000Z',
          type: 'editor.active',
          workspace: '/ws',
          repository: '/repo',
          filePath: '/ws/src/c.ts',
        },
      ]);

      assert.deepStrictEqual(graph.nodes, [
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
          editCount: 1,
          lastObservedAt: '2026-01-01T00:00:11.000Z',
        },
        {
          kind: 'file',
          filePath: '/ws/src/c.ts',
          visitCount: 1,
          editCount: 1,
          lastObservedAt: '2026-01-01T00:00:21.000Z',
        },
      ]);
      assert.deepStrictEqual(graph.edges, [
        {
          fromFilePath: '/ws/src/a.ts',
          toFilePath: '/ws/src/b.ts',
          relationship: 'definition',
          count: 1,
          lastObservedAt: '2026-01-01T00:00:10.000Z',
        },
        {
          fromFilePath: '/ws/src/b.ts',
          toFilePath: '/ws/src/c.ts',
          relationship: 'transition',
          count: 1,
          lastObservedAt: '2026-01-01T00:00:20.000Z',
        },
      ]);
    });

    test('adds an implicit transition when edits move to a different file', () => {
      const first = appendObservedEventToNavigationGraph(createEmptyNavigationGraph(), {
        timestamp: '2026-01-01T00:00:00.000Z',
        type: 'editor.active',
        workspace: '/ws',
        repository: '/repo',
        filePath: '/ws/src/a.ts',
      });
      const second = appendObservedEventToNavigationGraph(first, {
        timestamp: '2026-01-01T00:00:05.000Z',
        type: 'file.edit',
        workspace: '/ws',
        repository: '/repo',
        filePath: '/ws/src/b.ts',
      });

      assert.deepStrictEqual(second.edges, [
        {
          fromFilePath: '/ws/src/a.ts',
          toFilePath: '/ws/src/b.ts',
          relationship: 'transition',
          count: 1,
          lastObservedAt: '2026-01-01T00:00:05.000Z',
        },
      ]);
      assert.strictEqual(second.nodes[1].visitCount, 1);
      assert.strictEqual(second.nodes[1].editCount, 1);
    });
  });

  suite('Investigation with checkpoint', () => {
    test('checkpoint is optional and can be set', () => {
      const inv = createInvestigation('Test', '/ws');
      assert.strictEqual(inv.checkpoint, null);
      inv.checkpoint = createCheckpoint('Midway note');
      assert.strictEqual(inv.checkpoint.text, 'Midway note');
    });
  });

  suite('Serialization round-trip', () => {
    test('Investigation survives JSON round-trip', () => {
      const inv = createInvestigation('Roundtrip', '/ws', '/ws/.git');
      inv.checkpoint = createCheckpoint('note');
      inv.snapshot.editedFiles = ['a.ts', 'b.ts'];
      inv.snapshot.visitedFileCounts = { 'a.ts': 3, 'c.ts': 1 };
      inv.snapshot.lastLocation = { filePath: 'a.ts', line: 10, column: 5 };
      inv.snapshot.recentEvents = [
        {
          timestamp: new Date().toISOString(),
          type: 'editor.active',
          workspace: '/ws',
          repository: '/ws',
          filePath: 'a.ts',
        },
      ];
      inv.snapshot.git = {
        timestamp: new Date().toISOString(),
        availability: 'available',
        repositoryRoot: '/ws',
        head: 'abc123',
        branch: 'main',
        modifiedFiles: ['a.ts'],
        untrackedFiles: ['new.txt'],
        diffStats: { filesChanged: 1, insertions: 10, deletions: 2 },
      };
      inv.navigationGraph = {
        nodes: [
          {
            kind: 'file',
            filePath: 'a.ts',
            visitCount: 1,
            editCount: 1,
            lastObservedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        edges: [],
      };
      inv.timeline = [
        {
          timestamp: '2026-01-01T00:00:00.000Z',
          type: 'file.transition',
          filePath: 'a.ts',
        },
        {
          timestamp: '2026-01-01T00:00:01.000Z',
          type: 'file.edit',
          filePath: 'a.ts',
          count: 2,
        },
        {
          timestamp: '2026-01-01T00:00:02.000Z',
          type: 'checkpoint',
          text: 'note',
        },
        {
          timestamp: '2026-01-01T00:00:03.000Z',
          type: 'git.snapshot',
          availability: 'available',
          head: 'abc123',
          branch: 'main',
          modifiedCount: 1,
          untrackedCount: 1,
          filesChanged: 1,
          insertions: 10,
          deletions: 2,
        },
        {
          timestamp: '2026-01-01T00:00:04.000Z',
          type: 'save.point',
          reason: 'save',
        },
        {
          timestamp: '2026-01-01T00:00:05.000Z',
          type: 'resume.point',
        },
      ];

      const json = JSON.stringify(inv);
      const restored: Investigation = JSON.parse(json);

      assert.deepStrictEqual(restored, inv);
    });

    test('empty investigation round-trips', () => {
      const inv = createInvestigation('Empty', '/ws');
      const restored: Investigation = JSON.parse(JSON.stringify(inv));
      assert.deepStrictEqual(restored, inv);
    });

    test('explicit no-git state round-trips', () => {
      const inv = createInvestigation('No Git', '/ws');
      inv.snapshot.git = {
        timestamp: new Date().toISOString(),
        availability: 'not-repository',
        repositoryRoot: null,
        head: null,
        branch: null,
        modifiedFiles: [],
        untrackedFiles: [],
        diffStats: { filesChanged: 0, insertions: 0, deletions: 0 },
      };

      const restored: Investigation = JSON.parse(JSON.stringify(inv));
      assert.deepStrictEqual(restored, inv);
    });
  });
});
