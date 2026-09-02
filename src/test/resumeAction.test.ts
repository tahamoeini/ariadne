import * as assert from 'assert';
import { createInvestigation } from '../domain';
import {
  buildResumePlan,
  DEFAULT_RESUME_REOPEN_FILE_LIMIT,
} from '../commands/resumePlan';

suite('Resume Actions', () => {
  test('plans a conservative reopen without requiring Git state', () => {
    const investigation = createInvestigation('Read docs', '/workspace');
    investigation.snapshot.lastLocation = {
      filePath: '/workspace/src/guide.md',
      line: 12,
      column: 4,
    };
    investigation.snapshot.visitedFileCounts = {
      '/workspace/src/guide.md': 3,
      '/workspace/src/notes.md': 2,
    };

    const plan = buildResumePlan(investigation, {
      currentWorkspacePaths: ['/workspace'],
      fileExists: () => true,
      pathExists: () => true,
    });

    assert.strictEqual(plan.workspaceStatus, 'current');
    assert.deepStrictEqual(plan.filesToOpen, [
      '/workspace/src/notes.md',
      '/workspace/src/guide.md',
    ]);
    assert.deepStrictEqual(plan.missingFiles, []);
    assert.deepStrictEqual(plan.targetLocation, {
      filePath: '/workspace/src/guide.md',
      line: 12,
      column: 4,
    });
  });

  test('keeps reopening files when the saved workspace is no longer current', () => {
    const investigation = createInvestigation('Reopen elsewhere', '/saved-workspace');
    investigation.snapshot.editedFiles = ['/saved-workspace/src/token.ts'];
    investigation.snapshot.lastLocation = {
      filePath: '/saved-workspace/src/token.ts',
      line: 8,
      column: 2,
    };

    const plan = buildResumePlan(investigation, {
      currentWorkspacePaths: ['/different-workspace'],
      fileExists: () => true,
      pathExists: (targetPath) => targetPath === '/saved-workspace',
    });

    assert.strictEqual(plan.workspaceStatus, 'available');
    assert.deepStrictEqual(plan.filesToOpen, ['/saved-workspace/src/token.ts']);
    assert.deepStrictEqual(plan.missingFiles, []);
  });

  test('does not duplicate the last file when it was also edited', () => {
    const investigation = createInvestigation('Overlap', '/workspace');
    investigation.snapshot.editedFiles = [
      '/workspace/src/token.ts',
      '/workspace/src/helper.ts',
    ];
    investigation.snapshot.lastLocation = {
      filePath: '/workspace/src/token.ts',
      line: 3,
      column: 1,
    };

    const plan = buildResumePlan(investigation, {
      currentWorkspacePaths: ['/workspace'],
      fileExists: () => true,
      pathExists: () => true,
    });

    assert.deepStrictEqual(plan.filesToOpen, [
      '/workspace/src/helper.ts',
      '/workspace/src/token.ts',
    ]);
    assert.deepStrictEqual(plan.missingFiles, []);
  });

  test('caps reopened files for large investigations and reports omitted files', () => {
    const investigation = createInvestigation('Large investigation', '/workspace');
    investigation.snapshot.lastLocation = {
      filePath: '/workspace/src/last.ts',
      line: 4,
      column: 1,
    };
    investigation.snapshot.editedFiles = Array.from({ length: 6 }, (_, index) => {
      return `/workspace/src/edited-${index + 1}.ts`;
    });
    investigation.snapshot.visitedFileCounts = {
      '/workspace/src/last.ts': 4,
      '/workspace/src/read-only.ts': 3,
    };

    const plan = buildResumePlan(investigation, {
      currentWorkspacePaths: ['/workspace'],
      fileExists: () => true,
      pathExists: () => true,
    });

    assert.strictEqual(plan.maxFilesToOpen, DEFAULT_RESUME_REOPEN_FILE_LIMIT);
    assert.strictEqual(plan.filesToOpen.length, DEFAULT_RESUME_REOPEN_FILE_LIMIT);
    assert.deepStrictEqual(plan.filesToOpen, [
      '/workspace/src/edited-1.ts',
      '/workspace/src/edited-2.ts',
      '/workspace/src/edited-3.ts',
      '/workspace/src/edited-4.ts',
      '/workspace/src/last.ts',
    ]);
    assert.deepStrictEqual(plan.omittedFiles, [
      '/workspace/src/edited-5.ts',
      '/workspace/src/edited-6.ts',
      '/workspace/src/read-only.ts',
    ]);
  });

  test('prefers graph-adjacent files before global visit-count noise', () => {
    const investigation = createInvestigation('Graph-guided resume', '/workspace');
    investigation.snapshot.lastLocation = {
      filePath: '/workspace/src/anchor.ts',
      line: 9,
      column: 2,
    };
    investigation.snapshot.visitedFileCounts = {
      '/workspace/src/noisy.ts': 20,
      '/workspace/src/neighbor-a.ts': 2,
      '/workspace/src/neighbor-b.ts': 1,
    };
    investigation.navigationGraph = {
      nodes: [
        {
          kind: 'file',
          filePath: '/workspace/src/anchor.ts',
          visitCount: 3,
          editCount: 1,
          lastObservedAt: '2026-01-01T00:00:20.000Z',
        },
        {
          kind: 'file',
          filePath: '/workspace/src/neighbor-a.ts',
          visitCount: 2,
          editCount: 1,
          lastObservedAt: '2026-01-01T00:00:19.000Z',
        },
        {
          kind: 'file',
          filePath: '/workspace/src/neighbor-b.ts',
          visitCount: 1,
          editCount: 0,
          lastObservedAt: '2026-01-01T00:00:18.000Z',
        },
      ],
      edges: [
        {
          fromFilePath: '/workspace/src/anchor.ts',
          toFilePath: '/workspace/src/neighbor-a.ts',
          relationship: 'transition',
          count: 3,
          lastObservedAt: '2026-01-01T00:00:19.000Z',
        },
        {
          fromFilePath: '/workspace/src/neighbor-b.ts',
          toFilePath: '/workspace/src/anchor.ts',
          relationship: 'definition',
          count: 1,
          lastObservedAt: '2026-01-01T00:00:18.000Z',
        },
      ],
    };

    const plan = buildResumePlan(investigation, {
      currentWorkspacePaths: ['/workspace'],
      fileExists: () => true,
      pathExists: () => true,
    });

    assert.deepStrictEqual(plan.filesToOpen, [
      '/workspace/src/neighbor-b.ts',
      '/workspace/src/neighbor-a.ts',
      '/workspace/src/noisy.ts',
      '/workspace/src/anchor.ts',
    ]);
  });

  test('uses the graph anchor when no last location was saved', () => {
    const investigation = createInvestigation('Graph anchor fallback', '/workspace');
    investigation.navigationGraph = {
      nodes: [
        {
          kind: 'file',
          filePath: '/workspace/src/anchor.ts',
          visitCount: 1,
          editCount: 0,
          lastObservedAt: '2026-01-01T00:00:10.000Z',
        },
      ],
      edges: [],
    };

    const plan = buildResumePlan(investigation, {
      currentWorkspacePaths: ['/workspace'],
      fileExists: () => true,
      pathExists: () => true,
    });

    assert.deepStrictEqual(plan.filesToOpen, ['/workspace/src/anchor.ts']);
    assert.strictEqual(plan.targetLocation, null);
  });
});
