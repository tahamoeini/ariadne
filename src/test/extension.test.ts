import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ResumeExecutionResult } from '../commands/resumePlan';
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
    assert.ok(
      commands.includes('repotrail.openResumeSnapshot'),
      'Command repotrail.openResumeSnapshot not found',
    );
    assert.ok(
      commands.includes('repotrail.resumeInvestigation'),
      'Command repotrail.resumeInvestigation not found',
    );
    assert.ok(commands.includes('repotrail.deleteInvestigation'), 'Command repotrail.deleteInvestigation not found');
    assert.ok(commands.includes('repotrail.deleteAllData'), 'Command repotrail.deleteAllData not found');
    assert.ok(
      commands.includes('repotrail.showStorageLocation'),
      'Command repotrail.showStorageLocation not found',
    );
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

  test('shows the local storage location and deletes all RepoTrail data', async () => {
    const uri = await createTempFile('delete-all-fixture.ts', 'export const value = 1;\n');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
    await pause();

    const created = await vscode.commands.executeCommand<Investigation>(
      'repotrail.startInvestigation',
      {
        workspacePath: workspaceRoot,
        name: 'Delete all integration investigation',
        checkpointText: 'keep this local',
      },
    );

    assert.ok(created);
    assert.ok(api.debug.getRecentEvents().length > 0);

    const storageLocation = await vscode.commands.executeCommand<string>(
      'repotrail.showStorageLocation',
      {
        revealInOs: false,
      },
    );

    assert.ok(storageLocation);
    assert.ok(path.isAbsolute(storageLocation!));

    const deletedCount = await vscode.commands.executeCommand<number>(
      'repotrail.deleteAllData',
      {
        skipConfirmation: true,
      },
    );

    assert.strictEqual(deletedCount, 1);
    assert.deepStrictEqual(api.debug.getRecentEvents(), []);
    assert.deepStrictEqual(api.debug.listInvestigations(), []);
  });

  test('opens a resume snapshot for a saved investigation', async () => {
    const uri = await createTempFile('snapshot-fixture.ts', 'export const value = 1;\n');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
    await pause();

    const created = await vscode.commands.executeCommand<Investigation>(
      'repotrail.startInvestigation',
      {
        workspacePath: workspaceRoot,
        name: 'Snapshot investigation',
        checkpointText: 'Verify the saved snapshot surface.',
      },
    );

    assert.ok(created);

    await vscode.commands.executeCommand<Investigation>('repotrail.saveAndStopInvestigation', {
      workspacePath: workspaceRoot,
    });

    const opened = await vscode.commands.executeCommand<Investigation>(
      'repotrail.openResumeSnapshot',
      {
        id: created!.id,
      },
    );

    assert.strictEqual(opened?.id, created!.id);
    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.scheme, 'repotrail-snapshot');
    const text = vscode.window.activeTextEditor?.document.getText() ?? '';
    assert.ok(text.includes('# Snapshot investigation'));
    assert.ok(text.includes('## Checkpoint'));
    assert.ok(text.includes('## Current Git state'));
  });

  test('resumes a saved investigation by reopening files and the last location', async () => {
    const supportUri = await createTempFile('resume-support.ts', 'export const support = 1;\n');
    const lastUri = await createTempFile(
      'resume-last.ts',
      'first line\nsecond line\nthird line\n',
    );

    const created = await vscode.commands.executeCommand<Investigation>(
      'repotrail.startInvestigation',
      {
        workspacePath: workspaceRoot,
        name: 'Resume flow investigation',
        checkpointText: 'Need to continue from the last file.',
      },
    );

    assert.ok(created);

    const supportEditor = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(supportUri),
    );
    await pause();
    await supportEditor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(1, 0), 'export const updated = 2;\n');
    });
    await pause();

    const lastEditor = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(lastUri),
    );
    await pause();
    lastEditor.selection = new vscode.Selection(new vscode.Position(2, 1), new vscode.Position(2, 1));
    await pause();

    await vscode.commands.executeCommand<Investigation>('repotrail.saveAndStopInvestigation', {
      workspacePath: workspaceRoot,
    });

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await pause();

    const result = await vscode.commands.executeCommand<ResumeExecutionResult>(
      'repotrail.resumeInvestigation',
      {
        id: created!.id,
      },
    );

    assert.ok(result);
    assert.deepStrictEqual(result!.reopenedFiles, [supportUri.fsPath, lastUri.fsPath]);
    assert.deepStrictEqual(result!.missingFiles, []);
    assert.deepStrictEqual(result!.revealedLocation, {
      filePath: lastUri.fsPath,
      line: 3,
      column: 2,
    });
    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, lastUri.fsPath);
    assert.strictEqual(vscode.window.activeTextEditor?.selection.active.line, 2);
    assert.strictEqual(vscode.window.activeTextEditor?.selection.active.character, 1);
  });

  test('continues resuming when one saved file is missing', async () => {
    const missingUri = await createTempFile('resume-missing.ts', 'export const gone = true;\n');
    const keepUri = await createTempFile('resume-keep.ts', 'export const keep = true;\n');

    const created = await vscode.commands.executeCommand<Investigation>(
      'repotrail.startInvestigation',
      {
        workspacePath: workspaceRoot,
        name: 'Resume missing file investigation',
        checkpointText: null,
      },
    );

    assert.ok(created);

    const missingEditor = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(missingUri),
    );
    await pause();
    await missingEditor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(1, 0), 'export const edited = true;\n');
    });
    await pause();

    const keepEditor = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(keepUri),
    );
    await pause();
    keepEditor.selection = new vscode.Selection(new vscode.Position(0, 7), new vscode.Position(0, 7));
    await pause();

    await vscode.commands.executeCommand<Investigation>('repotrail.saveAndStopInvestigation', {
      workspacePath: workspaceRoot,
    });

    fs.rmSync(missingUri.fsPath, { force: true });
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await pause();

    const result = await vscode.commands.executeCommand<ResumeExecutionResult>(
      'repotrail.resumeInvestigation',
      {
        id: created!.id,
      },
    );

    assert.ok(result);
    assert.deepStrictEqual(result!.reopenedFiles, [keepUri.fsPath]);
    assert.deepStrictEqual(result!.missingFiles, [missingUri.fsPath]);
    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, keepUri.fsPath);
  });

  test('clamps stale saved locations when the file shrank', async () => {
    const staleUri = await createTempFile(
      'resume-stale.ts',
      'first line\nsecond line\nthird line stays long enough\n',
    );

    const created = await vscode.commands.executeCommand<Investigation>(
      'repotrail.startInvestigation',
      {
        workspacePath: workspaceRoot,
        name: 'Resume stale location investigation',
        checkpointText: null,
      },
    );

    assert.ok(created);

    const staleEditor = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(staleUri),
    );
    await pause();
    staleEditor.selection = new vscode.Selection(new vscode.Position(2, 20), new vscode.Position(2, 20));
    await pause();

    await vscode.commands.executeCommand<Investigation>('repotrail.saveAndStopInvestigation', {
      workspacePath: workspaceRoot,
    });

    fs.writeFileSync(staleUri.fsPath, 'tiny\n', 'utf-8');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await pause();

    const result = await vscode.commands.executeCommand<ResumeExecutionResult>(
      'repotrail.resumeInvestigation',
      {
        id: created!.id,
      },
    );

    assert.ok(result);
    assert.deepStrictEqual(result!.revealedLocation, {
      filePath: staleUri.fsPath,
      line: 1,
      column: 5,
    });
    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, staleUri.fsPath);
    assert.strictEqual(vscode.window.activeTextEditor?.selection.active.line, 0);
    assert.strictEqual(vscode.window.activeTextEditor?.selection.active.character, 4);
  });
});
