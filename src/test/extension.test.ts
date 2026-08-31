import * as assert from 'assert';
import * as vscode from 'vscode';

suite('RepoTrail Extension', () => {
  test('Extension should be present', () => {
    const ext = vscode.extensions.getExtension('repotrail.repotrail');
    assert.ok(ext, 'Extension not found');
  });

  test('repotrail.hello command should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('repotrail.hello'), 'Command repotrail.hello not found');
  });

  test('repotrail.hello command should execute without error', async () => {
    await vscode.commands.executeCommand('repotrail.hello');
  });
});
