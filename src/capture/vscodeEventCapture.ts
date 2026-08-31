import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { FileLocation, ObservedEvent } from '../domain';
import { createWorkspaceEventBuffer, EventBufferOptions, WorkspaceEventBuffer } from './eventBuffer';

interface DocumentContext {
  workspace: string;
  repository: string | null;
  filePath: string;
  languageId: string;
}

export interface RepoTrailDebugApi {
  getRecentEvents(workspace?: string): ObservedEvent[];
  clearRecentEvents(workspace?: string): void;
}

export interface VsCodeObservedEventCapture extends vscode.Disposable {
  debug: RepoTrailDebugApi;
}

function toTimestamp(now: (() => number) | undefined): string {
  return new Date((now ?? Date.now)()).toISOString();
}

function toFileLocation(filePath: string, position: vscode.Position): FileLocation {
  return {
    filePath,
    line: position.line + 1,
    column: position.character + 1,
  };
}

function hasGitDirectory(directoryPath: string): boolean {
  return fs.existsSync(path.join(directoryPath, '.git'));
}

function findRepositoryRoot(
  filePath: string,
  workspacePath: string,
  cache: Map<string, string | null>,
): string | null {
  const startDir = path.dirname(filePath);
  const cached = cache.get(startDir);
  if (cached !== undefined) {
    return cached;
  }

  const visited: string[] = [];
  let currentDir = startDir;
  while (true) {
    visited.push(currentDir);
    if (hasGitDirectory(currentDir)) {
      for (const dir of visited) {
        cache.set(dir, currentDir);
      }
      return currentDir;
    }

    if (currentDir === workspacePath) {
      break;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  for (const dir of visited) {
    cache.set(dir, null);
  }
  return null;
}

function resolveDocumentContext(
  document: vscode.TextDocument,
  repositoryCache: Map<string, string | null>,
): DocumentContext | null {
  if (document.uri.scheme !== 'file') {
    return null;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return null;
  }

  const filePath = document.uri.fsPath;
  return {
    workspace: workspaceFolder.uri.fsPath,
    repository: findRepositoryRoot(filePath, workspaceFolder.uri.fsPath, repositoryCache),
    filePath,
    languageId: document.languageId,
  };
}

function addEvent(
  buffer: WorkspaceEventBuffer,
  now: (() => number) | undefined,
  event: Omit<ObservedEvent, 'timestamp'>,
): void {
  buffer.add({
    ...event,
    timestamp: toTimestamp(now),
  });
}

export function createVsCodeObservedEventCapture(
  options: EventBufferOptions = {},
): VsCodeObservedEventCapture {
  const buffer = createWorkspaceEventBuffer(options);
  const repositoryCache = new Map<string, string | null>();
  const selectionKeys = new Map<string, string>();
  const disposables: vscode.Disposable[] = [];

  function recordActiveEditor(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      return;
    }

    const context = resolveDocumentContext(editor.document, repositoryCache);
    if (!context) {
      return;
    }

    addEvent(buffer, options.now, {
      type: 'editor.active',
      workspace: context.workspace,
      repository: context.repository,
      filePath: context.filePath,
      location: toFileLocation(context.filePath, editor.selection.active),
      source: { languageId: context.languageId },
    });
  }

  function recordSelection(editor: vscode.TextEditor): void {
    const context = resolveDocumentContext(editor.document, repositoryCache);
    if (!context) {
      return;
    }

    const location = toFileLocation(context.filePath, editor.selection.active);
    const selectionKey = [
      context.workspace,
      context.filePath,
      location.line,
      location.column,
    ].join(':');

    if (selectionKeys.get(context.workspace) === selectionKey) {
      return;
    }

    selectionKeys.set(context.workspace, selectionKey);
    addEvent(buffer, options.now, {
      type: 'editor.selection',
      workspace: context.workspace,
      repository: context.repository,
      filePath: context.filePath,
      location,
      source: { languageId: context.languageId },
    });
  }

  function recordEdit(event: vscode.TextDocumentChangeEvent): void {
    if (event.contentChanges.length === 0) {
      return;
    }

    const context = resolveDocumentContext(event.document, repositoryCache);
    if (!context) {
      return;
    }

    addEvent(buffer, options.now, {
      type: 'file.edit',
      workspace: context.workspace,
      repository: context.repository,
      filePath: context.filePath,
      location: toFileLocation(context.filePath, event.contentChanges[0].range.start),
      source: {
        languageId: context.languageId,
        changeCount: String(event.contentChanges.length),
      },
    });
  }

  disposables.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      recordActiveEditor(editor);
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      recordSelection(event.textEditor);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      recordEdit(event);
    }),
  );

  recordActiveEditor(vscode.window.activeTextEditor);

  return {
    debug: {
      getRecentEvents(workspace?: string): ObservedEvent[] {
        return buffer.getRecentEvents(workspace);
      },
      clearRecentEvents(workspace?: string): void {
        if (!workspace) {
          selectionKeys.clear();
        } else {
          selectionKeys.delete(workspace);
        }
        buffer.clear(workspace);
      },
    },
    dispose(): void {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    },
  };
}
