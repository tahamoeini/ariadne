import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  captureGitSnapshot,
  GitCommandResult,
  GitCommandRunner,
  parseGitDiffStats,
  parseGitStatus,
} from '../git';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'repotrail-git-test-'));
}

function rmDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeResult(overrides: Partial<GitCommandResult> = {}): GitCommandResult {
  return {
    exitCode: 0,
    stdout: '',
    stderr: '',
    ...overrides,
  };
}

suite('Git Snapshot', () => {
  suite('parseGitDiffStats', () => {
    test('parses full shortstat output', () => {
      assert.deepStrictEqual(
        parseGitDiffStats(' 3 files changed, 14 insertions(+), 2 deletions(-)\n'),
        { filesChanged: 3, insertions: 14, deletions: 2 },
      );
    });

    test('returns zeros for empty shortstat output', () => {
      assert.deepStrictEqual(parseGitDiffStats(''), {
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
      });
    });
  });

  suite('parseGitStatus', () => {
    test('parses branch, modified, untracked, and renamed files', () => {
      const parsed = parseGitStatus(
        [
          '## main...origin/main [ahead 1]',
          ' M src/app.ts',
          'R  docs/new name.md',
          'docs/old name.md',
          '?? notes with spaces.txt',
          '?? src/[special].ts',
          '',
        ].join('\0'),
      );

      assert.deepStrictEqual(parsed, {
        branch: 'main',
        noCommits: false,
        modifiedFiles: ['src/app.ts', 'docs/new name.md'],
        untrackedFiles: ['notes with spaces.txt', 'src/[special].ts'],
      });
    });

    test('parses detached head and unborn branch states', () => {
      assert.deepStrictEqual(parseGitStatus(['## HEAD (no branch)', ''].join('\0')), {
        branch: null,
        noCommits: false,
        modifiedFiles: [],
        untrackedFiles: [],
      });

      assert.deepStrictEqual(parseGitStatus(['## No commits yet on feature/demo', ''].join('\0')), {
        branch: 'feature/demo',
        noCommits: true,
        modifiedFiles: [],
        untrackedFiles: [],
      });
    });
  });

  suite('captureGitSnapshot', () => {
    let tmpDir: string;
    let repositoryRoot: string;
    let filePath: string;

    setup(() => {
      tmpDir = makeTmpDir();
      repositoryRoot = path.join(tmpDir, 'repo with spaces');
      fs.mkdirSync(path.join(repositoryRoot, '.git'), { recursive: true });
      fs.mkdirSync(path.join(repositoryRoot, 'src'), { recursive: true });
      filePath = path.join(repositoryRoot, 'src', 'file.ts');
      fs.writeFileSync(filePath, 'export const answer = 42;\n', 'utf8');
    });

    teardown(() => {
      rmDir(tmpDir);
    });

    test('captures repository state for a file path inside a repository', async () => {
      const commands: Array<{ cwd: string; args: string[] }> = [];
      const outputs = new Map<string, GitCommandResult>([
        [
          'status --porcelain=v1 --branch -z --untracked-files=all',
          makeResult({
            stdout: ['## main', ' M src/file.ts', '?? notes/new note.txt', ''].join('\0'),
          }),
        ],
        ['rev-parse --verify HEAD', makeResult({ stdout: 'abc123\n' })],
        ['diff --shortstat --no-ext-diff HEAD --', makeResult({ stdout: ' 1 file changed, 2 insertions(+), 1 deletion(-)\n' })],
      ]);

      const runGit: GitCommandRunner = (cwd, args) => {
        commands.push({ cwd, args });
        return outputs.get(args.join(' ')) ?? makeResult({ exitCode: 1, stderr: 'unexpected command' });
      };

      const snapshot = await captureGitSnapshot(filePath, {
        now: () => Date.parse('2026-02-03T04:05:06.000Z'),
        runGit,
      });

      assert.deepStrictEqual(snapshot, {
        timestamp: '2026-02-03T04:05:06.000Z',
        availability: 'available',
        repositoryRoot,
        head: 'abc123',
        branch: 'main',
        modifiedFiles: ['src/file.ts'],
        untrackedFiles: ['notes/new note.txt'],
        diffStats: { filesChanged: 1, insertions: 2, deletions: 1 },
      });
      assert.deepStrictEqual(
        commands.map((command) => command.cwd),
        [repositoryRoot, repositoryRoot, repositoryRoot],
      );
    });

    test('returns a clear no-git state outside a repository', async () => {
      const snapshot = await captureGitSnapshot(tmpDir, {
        now: () => Date.parse('2026-02-03T04:05:06.000Z'),
      });

      assert.deepStrictEqual(snapshot, {
        timestamp: '2026-02-03T04:05:06.000Z',
        availability: 'not-repository',
        repositoryRoot: null,
        head: null,
        branch: null,
        modifiedFiles: [],
        untrackedFiles: [],
        diffStats: { filesChanged: 0, insertions: 0, deletions: 0 },
      });
    });

    test('returns a git-missing state when the executable is unavailable', async () => {
      const runGit: GitCommandRunner = () =>
        makeResult({
          exitCode: null,
          error: Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }),
        });

      const snapshot = await captureGitSnapshot(repositoryRoot, {
        now: () => Date.parse('2026-02-03T04:05:06.000Z'),
        runGit,
      });

      assert.deepStrictEqual(snapshot, {
        timestamp: '2026-02-03T04:05:06.000Z',
        availability: 'git-missing',
        repositoryRoot,
        head: null,
        branch: null,
        modifiedFiles: [],
        untrackedFiles: [],
        diffStats: { filesChanged: 0, insertions: 0, deletions: 0 },
      });
    });

    test('handles detached HEAD and no-commit repositories', async () => {
      const detachedOutputs = new Map<string, GitCommandResult>([
        [
          'status --porcelain=v1 --branch -z --untracked-files=all',
          makeResult({ stdout: ['## HEAD (no branch)', ' M src/file.ts', ''].join('\0') }),
        ],
        ['rev-parse --verify HEAD', makeResult({ stdout: 'deadbeef\n' })],
        ['diff --shortstat --no-ext-diff HEAD --', makeResult({ stdout: ' 1 file changed, 1 insertion(+)\n' })],
      ]);
      const detachedSnapshot = await captureGitSnapshot(repositoryRoot, {
        now: () => Date.parse('2026-02-03T04:05:06.000Z'),
        runGit: (_cwd, args) => detachedOutputs.get(args.join(' ')) ?? makeResult({ exitCode: 1 }),
      });

      assert.strictEqual(detachedSnapshot.availability, 'available');
      assert.strictEqual(detachedSnapshot.branch, null);
      assert.strictEqual(detachedSnapshot.head, 'deadbeef');

      const unbornOutputs = new Map<string, GitCommandResult>([
        [
          'status --porcelain=v1 --branch -z --untracked-files=all',
          makeResult({
            stdout: ['## No commits yet on main', 'A  src/file.ts', '?? draft.txt', ''].join('\0'),
          }),
        ],
        ['rev-parse --verify HEAD', makeResult({ exitCode: 128, stderr: 'fatal: Needed a single revision\n' })],
        ['diff --shortstat --no-ext-diff --cached --root --', makeResult({ stdout: ' 1 file changed, 3 insertions(+)\n' })],
        ['diff --shortstat --no-ext-diff --', makeResult({ stdout: ' 1 file changed, 1 deletion(-)\n' })],
      ]);

      const unbornSnapshot = await captureGitSnapshot(repositoryRoot, {
        now: () => Date.parse('2026-02-03T04:05:06.000Z'),
        runGit: (_cwd, args) => unbornOutputs.get(args.join(' ')) ?? makeResult({ exitCode: 1 }),
      });

      assert.deepStrictEqual(unbornSnapshot, {
        timestamp: '2026-02-03T04:05:06.000Z',
        availability: 'available',
        repositoryRoot,
        head: null,
        branch: 'main',
        modifiedFiles: ['src/file.ts'],
        untrackedFiles: ['draft.txt'],
        diffStats: { filesChanged: 1, insertions: 3, deletions: 1 },
      });
    });

    test('returns a git-error state when repository commands fail unexpectedly', async () => {
      const outputs = new Map<string, GitCommandResult>([
        [
          'status --porcelain=v1 --branch -z --untracked-files=all',
          makeResult({ stdout: ['## main', ' M src/file.ts', ''].join('\0') }),
        ],
        ['rev-parse --verify HEAD', makeResult({ exitCode: 128, stderr: 'fatal: bad object HEAD\n' })],
      ]);

      const snapshot = await captureGitSnapshot(repositoryRoot, {
        now: () => Date.parse('2026-02-03T04:05:06.000Z'),
        runGit: (_cwd, args) => outputs.get(args.join(' ')) ?? makeResult({ exitCode: 1 }),
      });

      assert.deepStrictEqual(snapshot, {
        timestamp: '2026-02-03T04:05:06.000Z',
        availability: 'git-error',
        repositoryRoot,
        head: null,
        branch: null,
        modifiedFiles: [],
        untrackedFiles: [],
        diffStats: { filesChanged: 0, insertions: 0, deletions: 0 },
      });
    });
  });
});
