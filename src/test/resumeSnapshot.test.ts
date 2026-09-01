import * as assert from 'assert';
import { createInvestigation, GitSnapshot, Investigation } from '../domain';
import {
  buildMissingInvestigationContent,
  buildResumeSnapshotContent,
} from '../ui/resumeSnapshot';

function makeGitSnapshot(overrides: Partial<GitSnapshot> = {}): GitSnapshot {
  return {
    timestamp: '2026-06-01T12:00:00.000Z',
    availability: 'available',
    repositoryRoot: '/workspace',
    head: 'abc123',
    branch: 'feature/resume-snapshot',
    modifiedFiles: ['src/tokenService.ts', 'src/auth.test.ts'],
    untrackedFiles: ['notes.txt'],
    diffStats: { filesChanged: 2, insertions: 10, deletions: 3 },
    ...overrides,
  };
}

function makeInvestigation(): Investigation {
  const investigation = createInvestigation('Investigate token race', '/workspace', '/workspace');
  investigation.savedAt = '2026-06-01T12:34:56.000Z';
  investigation.checkpoint = {
    text: 'Reproduce delayed refresh after session invalidation.',
    createdAt: '2026-06-01T12:30:00.000Z',
  };
  investigation.snapshot.editedFiles = [
    '/workspace/src/tokenService.ts',
    '/workspace/src/auth.test.ts',
  ];
  investigation.snapshot.visitedFileCounts = {
    '/workspace/src/tokenService.ts': 6,
    '/workspace/src/auth.test.ts': 2,
    '/workspace/src/once.ts': 1,
  };
  investigation.snapshot.lastLocation = {
    filePath: '/workspace/src/tokenService.ts',
    line: 183,
    column: 7,
  };
  investigation.snapshot.recentEvents = [
    {
      timestamp: '2026-06-01T12:20:00.000Z',
      type: 'editor.active',
      workspace: '/workspace',
      repository: '/workspace',
      filePath: '/workspace/src/authController.ts',
    },
    {
      timestamp: '2026-06-01T12:21:00.000Z',
      type: 'editor.active',
      workspace: '/workspace',
      repository: '/workspace',
      filePath: '/workspace/src/tokenService.ts',
    },
    {
      timestamp: '2026-06-01T12:22:00.000Z',
      type: 'editor.active',
      workspace: '/workspace',
      repository: '/workspace',
      filePath: '/workspace/src/auth.test.ts',
    },
    {
      timestamp: '2026-06-01T12:23:00.000Z',
      type: 'file.edit',
      workspace: '/workspace',
      repository: '/workspace',
      filePath: '/workspace/src/auth.test.ts',
    },
    {
      timestamp: '2026-06-01T12:24:00.000Z',
      type: 'editor.active',
      workspace: '/workspace',
      repository: '/workspace',
      filePath: '/workspace/src/tokenService.ts',
    },
  ];
  investigation.snapshot.git = makeGitSnapshot();
  return investigation;
}

suite('Resume Snapshot', () => {
  test('renders factual resume snapshot content in the intended order', () => {
    const investigation = makeInvestigation();
    const currentGit = makeGitSnapshot({
      timestamp: '2026-06-02T09:00:00.000Z',
      head: 'def456',
      modifiedFiles: ['src/tokenService.ts', 'src/package.json'],
      untrackedFiles: [],
      diffStats: { filesChanged: 2, insertions: 14, deletions: 5 },
    });

    const content = buildResumeSnapshotContent(investigation, currentGit, {
      fileExists: (filePath) => !filePath.endsWith('auth.test.ts'),
    });

    assert.ok(content.startsWith('# Investigate token race\n\n## Checkpoint'));
    assert.ok(content.includes('Saved timestamp: 2026-06-01T12:34:56.000Z'));
    assert.ok(content.includes('- Workspace: /workspace'));
    assert.ok(content.includes('- Branch: feature/resume-snapshot'));
    assert.ok(content.includes('- HEAD changed: abc123 → def456'));
    assert.ok(content.includes('- Now modified: src/package.json'));
    assert.ok(content.includes('- No longer untracked: notes.txt'));
    assert.ok(
      content.includes('- src/auth.test.ts — saved path missing (deleted or moved)'),
    );
    assert.ok(content.includes('- src/tokenService.ts — 6 visits'));
    assert.ok(content.includes('- src/auth.test.ts — saved path missing (deleted or moved) — 2 visits'));
    assert.ok(content.includes('- src/tokenService.ts:183:7'));
    assert.ok(content.includes('→ src/tokenService.ts'));
  });

  test('renders empty and unavailable states honestly', () => {
    const investigation = createInvestigation('Read docs', '/workspace');

    const content = buildResumeSnapshotContent(investigation, null, {
      fileExists: () => true,
    });

    assert.ok(content.includes('- Repository: No repository was captured.'));
    assert.ok(content.includes('- No branch was captured.'));
    assert.ok(content.includes('- No saved or current Git snapshot is available for comparison.'));
    assert.ok(content.includes('- No edited files were captured.'));
    assert.ok(content.includes('- No revisited files were captured.'));
    assert.ok(content.includes('- No last location was captured.'));
    assert.ok(content.includes('No recent navigation path was captured.'));
  });

  test('renders missing investigation content', () => {
    const content = buildMissingInvestigationContent('missing-id');

    assert.ok(content.includes('# Resume Snapshot unavailable'));
    assert.ok(content.includes('- Investigation id: missing-id'));
    assert.ok(content.includes('missing, deleted, or unreadable'));
  });
});
