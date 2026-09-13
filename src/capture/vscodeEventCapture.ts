import * as path from 'path';
import * as vscode from 'vscode';
import { FileLocation, ObservedEvent } from '../domain';
import { createWorkspaceEventBuffer, EventBufferOptions } from './eventBuffer';
import { findGitRepositoryRoot } from '../git';

interface DocumentContext {
  workspace: string;
  repository: string | null;
  filePath: string;
  languageId: string;
}

const SELECTION_EVENT_MIN_INTERVAL_MS = 500;
const SELECTION_EVENT_MIN_MOVEMENT = 2;

export interface AriadneDebugApi {
  getRecentEvents(workspace?: string): ObservedEvent[];
  clearRecentEvents(workspace?: string): void;
}

export interface VsCodeObservedEventCapture extends vscode.Disposable {
  debug: AriadneDebugApi;
  getRecentEvents(workspace?: string): ObservedEvent[];
  getLastLocation(workspace?: string): FileLocation | null;
  clearRecentEvents(workspace?: string): void;
  readonly onDidObserveEvent: vscode.Event<ObservedEvent>;
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

function cloneLocation(location: FileLocation | null | undefined): FileLocation | null {
  if (!location) {
    return null;
  }

  return { ...location };
}

function cloneObservedEvent(event: ObservedEvent): ObservedEvent {
  return {
    ...event,
    location: event.location ? { ...event.location } : undefined,
    source: event.source ? { ...event.source } : undefined,
  };
}

function findRepositoryRoot(
  filePath: string,
  cache: Map<string, string | null>,
): string | null {
  const startDir = path.dirname(filePath);
  const cached = cache.get(startDir);
  if (cached !== undefined) {
    return cached;
  }

  const repositoryRoot = findGitRepositoryRoot(filePath);
  if (!repositoryRoot) {
    cache.set(startDir, null);
    return null;
  }

  let currentDir = startDir;
  while (true) {
    cache.set(currentDir, repositoryRoot);
    if (currentDir === repositoryRoot) {
      break;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return repositoryRoot;
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
    repository: findRepositoryRoot(filePath, repositoryCache),
    filePath,
    languageId: document.languageId,
  };
}

export function createVsCodeObservedEventCapture(
  options: EventBufferOptions = {},
): VsCodeObservedEventCapture {
  const buffer = createWorkspaceEventBuffer(options);
  const repositoryCache = new Map<string, string | null>();
  const selectionKeys = new Map<string, string>();
  const selectionTimestamps = new Map<string, number>();
  const disposables: vscode.Disposable[] = [];
  const observedEventEmitter = new vscode.EventEmitter<ObservedEvent>();
  const now = options.now ?? Date.now;

  function addEvent(event: Omit<ObservedEvent, 'timestamp'>): void {
    const observedEvent: ObservedEvent = {
      ...event,
      timestamp: toTimestamp(options.now),
    };
    buffer.add(observedEvent);
    observedEventEmitter.fire(cloneObservedEvent(observedEvent));
  }

  function recordActiveEditor(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      return;
    }

    const context = resolveDocumentContext(editor.document, repositoryCache);
    if (!context) {
      return;
    }

    addEvent({
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
    const selectionScope = `${context.workspace}:${context.filePath}`;
    const selectionKey = [location.line, location.column].join(':');
    const previousSelectionKey = selectionKeys.get(selectionScope);

    if (previousSelectionKey === selectionKey) {
      return;
    }

    const previousTimestamp = selectionTimestamps.get(selectionScope) ?? Number.NEGATIVE_INFINITY;
    const currentTimestamp = now();
    if (previousSelectionKey) {
      const [previousLineRaw, previousColumnRaw] = previousSelectionKey.split(':');
      const previousLine = Number(previousLineRaw);
      const previousColumn = Number(previousColumnRaw);
      const rowMovement = Math.abs(location.line - previousLine);
      const columnMovement = Math.abs(location.column - previousColumn);
      const withinMinInterval = currentTimestamp - previousTimestamp < SELECTION_EVENT_MIN_INTERVAL_MS;
      const belowMovementThreshold =
        rowMovement < SELECTION_EVENT_MIN_MOVEMENT &&
        columnMovement < SELECTION_EVENT_MIN_MOVEMENT;

      if (withinMinInterval && belowMovementThreshold) {
        selectionKeys.set(selectionScope, selectionKey);
        selectionTimestamps.set(selectionScope, currentTimestamp);
        return;
      }
    }

    selectionKeys.set(selectionScope, selectionKey);
    selectionTimestamps.set(selectionScope, currentTimestamp);
    addEvent({
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

    addEvent({
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
          selectionTimestamps.clear();
        } else {
          for (const key of Array.from(selectionKeys.keys())) {
            if (key.startsWith(`${workspace}:`)) {
              selectionKeys.delete(key);
              selectionTimestamps.delete(key);
            }
          }
        }
        buffer.clear(workspace);
      },
    },
    getRecentEvents(workspace?: string): ObservedEvent[] {
      return buffer.getRecentEvents(workspace);
    },
    getLastLocation(workspace?: string): FileLocation | null {
      return cloneLocation(buffer.getLastLocation(workspace));
    },
    clearRecentEvents(workspace?: string): void {
      if (!workspace) {
        selectionKeys.clear();
        selectionTimestamps.clear();
      } else {
        for (const key of Array.from(selectionKeys.keys())) {
          if (key.startsWith(`${workspace}:`)) {
            selectionKeys.delete(key);
            selectionTimestamps.delete(key);
          }
        }
      }
      buffer.clear(workspace);
    },
    onDidObserveEvent: observedEventEmitter.event,
    dispose(): void {
      for (const disposable of disposables) {
        disposable.dispose();
      }
      observedEventEmitter.dispose();
    },
  };
}
