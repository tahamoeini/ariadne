import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ResumeExecutionResult } from '../commands/resumePlan';
import { Investigation } from '../domain';

suite('Ariadne Extension', () => {
  let activationResult: unknown;
  let workspaceRoot: string;
  let tempDir: string;

  async function pause(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async function listSavedInvestigations(): Promise<Investigation[]> {
    return (
      (await vscode.commands.executeCommand<Investigation[]>('ariadne.listInvestigations', {
        quiet: true,
      })) ?? []
    );
  }

  async function createTempFile(name: string, content: string): Promise<vscode.Uri> {
    const filePath = path.join(tempDir, name);
    fs.writeFileSync(filePath, content, 'utf-8');
    return vscode.Uri.file(filePath);
  }

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('ariadne.ariadne');
    assert.ok(ext, 'Extension not found');
    activationResult = await ext!.activate();

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, 'Workspace folder not found');
    workspaceRoot = workspaceFolder!.uri.fsPath;
    tempDir = path.join(workspaceRoot, '.tmp-vscode-tests');
    fs.mkdirSync(tempDir, { recursive: true });
  });

  setup(async () => {
    await vscode.commands.executeCommand<number>('ariadne.deleteAllData', {
      skipConfirmation: true,
    });
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await pause();
  });

  teardown(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
  });

  test('Extension should be present', () => {
    const ext = vscode.extensions.getExtension('ariadne.ariadne');
    assert.ok(ext, 'Extension not found');
  });

  test('activates on startup so recent activity can be captured before commands run', () => {
    const ext = vscode.extensions.getExtension('ariadne.ariadne');
    assert.ok(ext, 'Extension not found');
    const activationEvents = ext!.packageJSON.activationEvents as string[] | undefined;
    assert.ok(Array.isArray(activationEvents), 'activationEvents must be declared');
    assert.ok(
      activationEvents.includes('onStartupFinished'),
      'onStartupFinished activation is required for retroactive capture',
    );
  });

  test('Ariadne commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(!commands.includes('ariadne.hello'), 'Unexpected placeholder hello command found');
    assert.ok(commands.includes('ariadne.startInvestigation'), 'Command ariadne.startInvestigation not found');
    assert.ok(
      commands.includes('ariadne.saveRecentActivityAsInvestigation'),
      'Command ariadne.saveRecentActivityAsInvestigation not found',
    );
    assert.ok(commands.includes('ariadne.updateCheckpoint'), 'Command ariadne.updateCheckpoint not found');
    assert.ok(
      commands.includes('ariadne.attachBrowserReference'),
      'Command ariadne.attachBrowserReference not found',
    );
    assert.ok(
      commands.includes('ariadne.saveAndStopInvestigation'),
      'Command ariadne.saveAndStopInvestigation not found',
    );
    assert.ok(commands.includes('ariadne.listInvestigations'), 'Command ariadne.listInvestigations not found');
    assert.ok(
      commands.includes('ariadne.openResumeSnapshot'),
      'Command ariadne.openResumeSnapshot not found',
    );
    assert.ok(
      commands.includes('ariadne.resumeInvestigation'),
      'Command ariadne.resumeInvestigation not found',
    );
    assert.ok(commands.includes('ariadne.deleteInvestigation'), 'Command ariadne.deleteInvestigation not found');
    assert.ok(commands.includes('ariadne.deleteAllData'), 'Command ariadne.deleteAllData not found');
    assert.ok(
      commands.includes('ariadne.showStorageLocation'),
      'Command ariadne.showStorageLocation not found',
    );
  });

  test('does not expose captured data through the production extension API', () => {
    assert.strictEqual(activationResult, undefined);
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

    const investigation = await vscode.commands.executeCommand<Investigation>(
      'ariadne.saveRecentActivityAsInvestigation',
      {
        workspacePath: workspaceRoot,
        name: 'Captured recent editor activity',
        checkpointText: null,
      },
    );

    assert.ok(investigation);
    const matchingEvents = investigation!.snapshot.recentEvents.filter(
      (event) => event.filePath === uri.fsPath,
    );
    const eventTypes = matchingEvents.map((event) => event.type);

    assert.ok(eventTypes.includes('editor.active'));
    assert.ok(eventTypes.includes('editor.selection'));
    assert.ok(eventTypes.includes('file.edit'));

    const selectionEvent = matchingEvents.find((event) => event.type === 'editor.selection');
    assert.ok(selectionEvent);
    assert.strictEqual(selectionEvent!.workspace, workspaceRoot);
    assert.strictEqual(selectionEvent!.repository, workspaceRoot);
    assert.deepStrictEqual(selectionEvent!.location, {
      filePath: uri.fsPath,
      line: 2,
      column: 3,
    });

    const editEvent = matchingEvents.find((event) => event.type === 'file.edit');
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

    const investigation = await vscode.commands.executeCommand<Investigation>(
      'ariadne.saveRecentActivityAsInvestigation',
      {
        workspacePath: workspaceRoot,
        name: 'Rapid transitions',
        checkpointText: null,
      },
    );

    assert.ok(investigation);
    const activeTransitions = investigation!.snapshot.recentEvents
      .filter((event) => event.type === 'editor.active')
      .map((event) => event.filePath)
      .filter((filePath): filePath is string => Boolean(filePath))
      .slice(-3);

    assert.deepStrictEqual(activeTransitions, [firstUri.fsPath, secondUri.fsPath, firstUri.fsPath]);
  });

  test('records selection events independently across files in the same workspace', async () => {
    const firstUri = await createTempFile('selection-a.ts', 'alpha\n');
    const secondUri = await createTempFile('selection-b.ts', 'beta\n');

    const firstEditor = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(firstUri),
    );
    await pause();
    firstEditor.selection = new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 1));
    await pause();

    const secondEditor = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(secondUri),
    );
    await pause();
    secondEditor.selection = new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 1));
    await pause();

    const investigation = await vscode.commands.executeCommand<Investigation>(
      'ariadne.saveRecentActivityAsInvestigation',
      {
        workspacePath: workspaceRoot,
        name: 'Cross-file selections',
        checkpointText: null,
      },
    );

    assert.ok(investigation);
    const selectionEvents = investigation!.snapshot.recentEvents.filter(
      (event) => event.type === 'editor.selection',
    );

    assert.deepStrictEqual(
      selectionEvents.map((event) => event.filePath),
      [firstUri.fsPath, secondUri.fsPath],
    );
  });

  test('reduces noisy selection events while keeping meaningful location updates', async () => {
    const uri = await createTempFile('selection-noise.ts', 'alpha\nbeta\ngamma\n');
    const editor = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(uri),
    );
    await pause();

    editor.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
    await pause();
    editor.selection = new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 1));
    await pause();
    editor.selection = new vscode.Selection(new vscode.Position(0, 2), new vscode.Position(0, 2));
    await pause();
    editor.selection = new vscode.Selection(new vscode.Position(2, 0), new vscode.Position(2, 0));
    await pause();

    const investigation = await vscode.commands.executeCommand<Investigation>(
      'ariadne.saveRecentActivityAsInvestigation',
      {
        workspacePath: workspaceRoot,
        name: 'Selection noise guard',
        checkpointText: null,
      },
    );

    assert.ok(investigation);
    const selectionEvents = investigation!.snapshot.recentEvents.filter(
      (event) => event.type === 'editor.selection' && event.filePath === uri.fsPath,
    );

    // Rapid nearby movements are collapsed; larger jumps still persist.
    assert.ok(selectionEvents.length <= 2, `Expected <= 2 selection events, got ${selectionEvents.length}`);
    assert.strictEqual(investigation!.snapshot.lastLocation?.filePath, uri.fsPath);
    assert.strictEqual(investigation!.snapshot.lastLocation?.line, 3);
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
      'ariadne.startInvestigation',
      {
        workspacePath: workspaceRoot,
        name: 'Integration investigation',
        checkpointText: null,
      },
    );

    assert.ok(created);
    assert.strictEqual(created!.name, 'Integration investigation');

    const checkpointed = await vscode.commands.executeCommand<Investigation>(
      'ariadne.updateCheckpoint',
      {
        workspacePath: workspaceRoot,
        checkpointText: 'Need to inspect the new export.',
      },
    );

    assert.ok(checkpointed);
    assert.strictEqual(checkpointed!.checkpoint?.text, 'Need to inspect the new export.');

    const saved = await vscode.commands.executeCommand<Investigation>(
      'ariadne.saveAndStopInvestigation',
      { workspacePath: workspaceRoot },
    );

    assert.ok(saved);

    const afterStop = await vscode.commands.executeCommand<Investigation | null>(
      'ariadne.updateCheckpoint',
      {
        workspacePath: workspaceRoot,
        checkpointText: 'Should not apply after stop.',
      },
    );
    assert.strictEqual(afterStop, null);

    const investigations = await listSavedInvestigations();

    assert.ok(investigations?.some((investigation) => investigation.id === created!.id));

    const deleted = await vscode.commands.executeCommand<boolean>(
      'ariadne.deleteInvestigation',
      {
        id: created!.id,
        skipConfirmation: true,
      },
    );

    assert.strictEqual(deleted, true);
    assert.ok(
      !(await listSavedInvestigations()).some((investigation) => investigation.id === created!.id),
    );
  });

  test('shows the local storage location and deletes all Ariadne data', async () => {
    const uri = await createTempFile('delete-all-fixture.ts', 'export const value = 1;\n');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
    await pause();

    const created = await vscode.commands.executeCommand<Investigation>(
      'ariadne.startInvestigation',
      {
        workspacePath: workspaceRoot,
        name: 'Delete all integration investigation',
        checkpointText: 'keep this local',
      },
    );

    assert.ok(created);

    const storageLocation = await vscode.commands.executeCommand<string>(
      'ariadne.showStorageLocation',
      {
        revealInOs: false,
      },
    );

    assert.ok(storageLocation);
    assert.ok(path.isAbsolute(storageLocation!));

    const deletedCount = await vscode.commands.executeCommand<number>(
      'ariadne.deleteAllData',
      {
        skipConfirmation: true,
      },
    );

    assert.strictEqual(deletedCount, 1);
    assert.deepStrictEqual(await listSavedInvestigations(), []);

    const recreated = await vscode.commands.executeCommand<Investigation | null>(
      'ariadne.saveRecentActivityAsInvestigation',
      {
        workspacePath: workspaceRoot,
        name: 'Should stay empty after delete all',
        checkpointText: null,
      },
    );
    assert.strictEqual(recreated, null);
  });

  test('opens a resume snapshot for a saved investigation', async () => {
    const uri = await createTempFile('snapshot-fixture.ts', 'export const value = 1;\n');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
    await pause();

    const created = await vscode.commands.executeCommand<Investigation>(
      'ariadne.startInvestigation',
      {
        workspacePath: workspaceRoot,
        name: 'Snapshot investigation',
        checkpointText: 'Verify the saved snapshot surface.',
      },
    );

    assert.ok(created);

    const referenced = await vscode.commands.executeCommand<Investigation>(
      'ariadne.attachBrowserReference',
      {
        workspacePath: workspaceRoot,
        url: 'https://developer.mozilla.org/docs/Web/API/URL',
        title: 'MDN URL',
      },
    );

    assert.ok(referenced);
    assert.strictEqual(referenced!.browserReferences.length, 1);
    assert.strictEqual(referenced!.browserReferences[0].title, 'MDN URL');

    await vscode.commands.executeCommand<Investigation>('ariadne.saveAndStopInvestigation', {
      workspacePath: workspaceRoot,
    });

    const opened = await vscode.commands.executeCommand<Investigation>(
      'ariadne.openResumeSnapshot',
      {
        id: created!.id,
      },
    );

    assert.strictEqual(opened?.id, created!.id);
    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.scheme, 'ariadne-snapshot');
    const text = vscode.window.activeTextEditor?.document.getText() ?? '';
    assert.ok(text.includes('# Snapshot investigation'));
    assert.ok(text.includes('## Checkpoint'));
    assert.ok(text.includes('## External references'));
    assert.ok(text.includes('https://developer.mozilla.org/docs/Web/API/URL'));
    assert.ok(text.includes('## Current Git state at open time'));
  });

  test('reuses the same resume snapshot document after saved data changes', async () => {
    const uri = await createTempFile('snapshot-refresh-fixture.ts', 'export const value = 1;\n');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
    await pause();

    const created = await vscode.commands.executeCommand<Investigation>(
      'ariadne.startInvestigation',
      {
        workspacePath: workspaceRoot,
        name: 'Snapshot refresh investigation',
        checkpointText: 'First checkpoint',
      },
    );

    assert.ok(created);

    await vscode.commands.executeCommand<Investigation>('ariadne.saveAndStopInvestigation', {
      workspacePath: workspaceRoot,
    });

    await vscode.commands.executeCommand<Investigation>('ariadne.openResumeSnapshot', {
      id: created!.id,
    });
    await pause();

    const firstDocument = vscode.window.activeTextEditor?.document;
    assert.ok(firstDocument);
    assert.ok(firstDocument!.getText().includes('First checkpoint'));
    const firstUri = firstDocument!.uri.toString();

    const storageLocation = await vscode.commands.executeCommand<string>(
      'ariadne.showStorageLocation',
      {
        revealInOs: false,
      },
    );

    assert.ok(storageLocation);

    const investigationPath = path.join(
      storageLocation!,
      'investigations',
      `${created!.id}.json`,
    );
    const envelope = JSON.parse(fs.readFileSync(investigationPath, 'utf-8')) as {
      schemaVersion: number;
      investigation: {
        savedAt: string;
        checkpoint: { text: string } | null;
      };
    };
    envelope.investigation.savedAt = '2030-01-01T00:00:00.000Z';
    if (envelope.investigation.checkpoint) {
      envelope.investigation.checkpoint.text = 'Updated checkpoint';
    }
    fs.writeFileSync(investigationPath, JSON.stringify(envelope, null, 2), 'utf-8');

    await vscode.commands.executeCommand<Investigation>('ariadne.openResumeSnapshot', {
      id: created!.id,
    });
    await pause();

    const secondDocument = vscode.window.activeTextEditor?.document;
    assert.ok(secondDocument);
    assert.strictEqual(secondDocument!.uri.toString(), firstUri);
    assert.ok(secondDocument!.getText().includes('Updated checkpoint'));
  });

  test('resumes a saved investigation by reopening files and the last location', async () => {
    const supportUri = await createTempFile('resume-support.ts', 'export const support = 1;\n');
    const lastUri = await createTempFile(
      'resume-last.ts',
      'first line\nsecond line\nthird line\n',
    );

    const created = await vscode.commands.executeCommand<Investigation>(
      'ariadne.startInvestigation',
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

    await vscode.commands.executeCommand<Investigation>('ariadne.saveAndStopInvestigation', {
      workspacePath: workspaceRoot,
    });

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await pause();

    const result = await vscode.commands.executeCommand<ResumeExecutionResult>(
      'ariadne.resumeInvestigation',
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
      'ariadne.startInvestigation',
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

    await vscode.commands.executeCommand<Investigation>('ariadne.saveAndStopInvestigation', {
      workspacePath: workspaceRoot,
    });

    fs.rmSync(missingUri.fsPath, { force: true });
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await pause();

    const result = await vscode.commands.executeCommand<ResumeExecutionResult>(
      'ariadne.resumeInvestigation',
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
      'ariadne.startInvestigation',
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

    await vscode.commands.executeCommand<Investigation>('ariadne.saveAndStopInvestigation', {
      workspacePath: workspaceRoot,
    });

    fs.writeFileSync(staleUri.fsPath, 'tiny\n', 'utf-8');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await pause();

    const result = await vscode.commands.executeCommand<ResumeExecutionResult>(
      'ariadne.resumeInvestigation',
      {
        id: created!.id,
      },
    );

    assert.ok(result);
    assert.deepStrictEqual(result!.revealedLocation, {
      filePath: staleUri.fsPath,
      line: 2,
      column: 1,
    });
    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, staleUri.fsPath);
    assert.strictEqual(vscode.window.activeTextEditor?.selection.active.line, 1);
    assert.strictEqual(vscode.window.activeTextEditor?.selection.active.character, 0);
  });
});
