import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Investigation } from '../domain';
import { RepoTrailExtensionApi } from '../extension';

suite('RepoTrail Extension', () => {
  let api: RepoTrailExtensionApi;
  let workspaceRoot: string;
  let tempDir: string;

  async function pause(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async function createTempFile(name: string, content: string): Promise<vscode.Uri> {
    const filePath = path.join(tempDir, name);
    fs.writeFileSync(filePath, content, 'utf-8');
    return vscode.Uri.file(filePath);
  }

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('repotrail.repotrail');
    assert.ok(ext, 'Extension not found');
    api = (await ext!.activate()) as RepoTrailExtensionApi;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, 'Workspace folder not found');
    workspaceRoot = workspaceFolder!.uri.fsPath;
    tempDir = path.join(workspaceRoot, '.tmp-vscode-tests');
    fs.mkdirSync(tempDir, { recursive: true });
  });

  setup(async () => {
    api.debug.clearRecentEvents();
    await api.debug.clearInvestigations();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await pause();
  });

  teardown(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
  });

  test('Extension should be present', () => {
    const ext = vscode.extensions.getExtension('repotrail.repotrail');
    assert.ok(ext, 'Extension not found');
  });

  test('repotrail.hello command should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('repotrail.hello'), 'Command repotrail.hello not found');
    assert.ok(commands.includes('repotrail.startInvestigation'), 'Command repotrail.startInvestigation not found');
    assert.ok(
      commands.includes('repotrail.saveRecentActivityAsInvestigation'),
      'Command repotrail.saveRecentActivityAsInvestigation not found',
    );
    assert.ok(commands.includes('repotrail.updateCheckpoint'), 'Command repotrail.updateCheckpoint not found');
    assert.ok(
      commands.includes('repotrail.saveAndStopInvestigation'),
      'Command repotrail.saveAndStopInvestigation not found',
    );
    assert.ok(commands.includes('repotrail.listInvestigations'), 'Command repotrail.listInvestigations not found');
    assert.ok(commands.includes('repotrail.deleteInvestigation'), 'Command repotrail.deleteInvestigation not found');
  });

  test('repotrail.hello command should execute without error', async () => {
    await vscode.commands.executeCommand('repotrail.hello');
  });

  test('debug api exposes an empty buffer after clearing', () => {
    assert.deepStrictEqual(api.debug.getRecentEvents(), []);
  });

  test('captures active editor, selection, and edit events with context', async () => {
    const uri = await createTempFile('capture-fixture.ts', 'line one\nline two\n');
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    await pause();

    editor.selection = new vscode.Selection(new vscode.Position(1, 2), new vscode.Position(1, 2));
    await pause();

    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 0), '// change\n');
    });
    await pause();

    const events = api.debug.getRecentEvents(workspaceRoot);
    const relevant = events.filter((event) => event.filePath === uri.fsPath);
    const eventTypes = relevant.map((event) => event.type);

    assert.ok(eventTypes.includes('editor.active'));
    assert.ok(eventTypes.includes('editor.selection'));
    assert.ok(eventTypes.includes('file.edit'));

    const selectionEvent = relevant.find((event) => event.type === 'editor.selection');
    assert.ok(selectionEvent);
    assert.strictEqual(selectionEvent!.workspace, workspaceRoot);
    assert.strictEqual(selectionEvent!.repository, workspaceRoot);
    assert.deepStrictEqual(selectionEvent!.location, {
      filePath: uri.fsPath,
      line: 2,
      column: 3,
    });

    const editEvent = relevant.find((event) => event.type === 'file.edit');
    assert.ok(editEvent);
    assert.strictEqual(editEvent!.source?.changeCount, '1');
  });

  test('preserves rapid file transitions in order', async () => {
    const firstUri = await createTempFile('rapid-a.ts', 'alpha\n');
    const secondUri = await createTempFile('rapid-b.ts', 'beta\n');

    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(firstUri));
    await pause();
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(secondUri));
    await pause();
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(firstUri));
    await pause();

    const activeTransitions = api.debug
      .getRecentEvents(workspaceRoot)
      .filter((event) => event.type === 'editor.active')
      .map((event) => event.filePath)
      .filter((filePath): filePath is string => Boolean(filePath))
      .slice(-3);

    assert.deepStrictEqual(activeTransitions, [firstUri.fsPath, secondUri.fsPath, firstUri.fsPath]);
  });

  test('supports the investigation lifecycle through commands', async () => {
    const uri = await createTempFile('lifecycle-fixture.ts', 'export const value = 1;\n');
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    await pause();

    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(1, 0), 'export const nextValue = 2;\n');
    });
    await pause();

    const created = await vscode.commands.executeCommand<Investigation>(
      'repotrail.startInvestigation',
      {
        workspacePath: workspaceRoot,
        name: 'Integration investigation',
        checkpointText: null,
      },
    );

    assert.ok(created);
    assert.strictEqual(created!.name, 'Integration investigation');
    assert.strictEqual(api.debug.getActiveInvestigation(workspaceRoot)?.id, created!.id);

    const checkpointed = await vscode.commands.executeCommand<Investigation>(
      'repotrail.updateCheckpoint',
      {
        workspacePath: workspaceRoot,
        checkpointText: 'Need to inspect the new export.',
      },
    );

    assert.ok(checkpointed);
    assert.strictEqual(checkpointed!.checkpoint?.text, 'Need to inspect the new export.');

    const saved = await vscode.commands.executeCommand<Investigation>(
      'repotrail.saveAndStopInvestigation',
      { workspacePath: workspaceRoot },
    );

    assert.ok(saved);
    assert.strictEqual(api.debug.getActiveInvestigation(workspaceRoot), null);

    const investigations = await vscode.commands.executeCommand<Investigation[]>(
      'repotrail.listInvestigations',
      { quiet: true },
    );

    assert.ok(investigations?.some((investigation) => investigation.id === created!.id));

    const deleted = await vscode.commands.executeCommand<boolean>(
      'repotrail.deleteInvestigation',
      {
        id: created!.id,
        skipConfirmation: true,
      },
    );

    assert.strictEqual(deleted, true);
    assert.ok(!api.debug.listInvestigations().some((investigation) => investigation.id === created!.id));
  });
});
