import * as vscode from 'vscode';
import {
  createVsCodeObservedEventCapture,
  VsCodeObservedEventCapture,
} from './capture/vscodeEventCapture';
import { createResumeSnapshotOpener } from './ui';
import {
  InvestigationLifecycleService,
  registerInvestigationCommands,
} from './commands';

let activeLifecycleService: InvestigationLifecycleService | null = null;

interface RepoTrailRuntimeConfiguration {
  retentionMs: number;
  maxEvents: number;
  autoSaveDebounceMs: number;
}

function normalizeInteger(value: number, fallback: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.floor(value);
  return Math.min(maximum, Math.max(minimum, normalized));
}

function readRuntimeConfiguration(): RepoTrailRuntimeConfiguration {
  const configuration = vscode.workspace.getConfiguration('repotrail');
  const retentionMinutes = normalizeInteger(
    configuration.get<number>('capture.retentionMinutes', 20),
    20,
    1,
    240,
  );
  const maxEvents = normalizeInteger(
    configuration.get<number>('capture.maxEvents', 1000),
    1000,
    100,
    20000,
  );
  const autoSaveSeconds = normalizeInteger(
    configuration.get<number>('lifecycle.autoSaveSeconds', 15),
    15,
    0,
    3600,
  );

  return {
    retentionMs: retentionMinutes * 60 * 1000,
    maxEvents,
    autoSaveDebounceMs: autoSaveSeconds * 1000,
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const runtimeConfiguration = readRuntimeConfiguration();
  const eventCapture: VsCodeObservedEventCapture = createVsCodeObservedEventCapture({
    retentionMs: runtimeConfiguration.retentionMs,
    maxEvents: runtimeConfiguration.maxEvents,
  });
  const lifecycle = new InvestigationLifecycleService({
    storageDir: context.globalStorageUri.fsPath,
    capture: eventCapture,
    stateStore: context.workspaceState,
    autoSaveDebounceMs: runtimeConfiguration.autoSaveDebounceMs,
  });
  activeLifecycleService = lifecycle;
  const { opener: snapshotOpener, disposable: snapshotProvider } = createResumeSnapshotOpener({
    storageDir: context.globalStorageUri.fsPath,
  });
  const lifecycleEventSubscription = eventCapture.onDidObserveEvent((event) => {
    lifecycle.recordObservedEvent(event);
  });
  const lifecycleCommands = registerInvestigationCommands(lifecycle, snapshotOpener, {
    clearRecentActivity: () => {
      eventCapture.clearRecentEvents();
    },
  });

  context.subscriptions.push(
    lifecycleCommands,
    lifecycleEventSubscription,
    eventCapture,
    snapshotProvider,
  );
}

export async function deactivate(): Promise<void> {
  try {
    await activeLifecycleService?.persistActiveInvestigations();
    activeLifecycleService?.dispose();
  } finally {
    activeLifecycleService = null;
  }
}
