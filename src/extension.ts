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
import { AriadneAdapterState, LocalAriadneAdapter } from './adapter/localProtocol';

let activeLifecycleService: InvestigationLifecycleService | null = null;

interface AriadneRuntimeConfiguration {
  retentionMs: number;
  maxEvents: number;
  autoSaveDebounceMs: number;
  ipcConfigPath: string;
}

function normalizeInteger(value: number, fallback: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.floor(value);
  return Math.min(maximum, Math.max(minimum, normalized));
}

function readRuntimeConfiguration(): AriadneRuntimeConfiguration {
  const configuration = vscode.workspace.getConfiguration('ariadne');
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
  const ipcConfigPath = configuration.get<string>('ipc.configPath', '').trim();

  return {
    retentionMs: retentionMinutes * 60 * 1000,
    maxEvents,
    autoSaveDebounceMs: autoSaveSeconds * 1000,
    ipcConfigPath,
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const warnedAutoSaveWorkspaces = new Set<string>();
  const runtimeConfiguration = readRuntimeConfiguration();
  const adapterStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  const updateAdapterStatus = (state: AriadneAdapterState): void => {
    const labels: Record<AriadneAdapterState, string> = {
      connected: '$(plug) Ariadne Core',
      disconnected: '$(debug-disconnect) Ariadne Core: offline',
      'invalid-config': '$(warning) Ariadne Core: configure IPC',
    };
    adapterStatus.text = labels[state];
    adapterStatus.tooltip = 'Ariadne VS Code adapter';
    adapterStatus.show();
  };
  updateAdapterStatus(runtimeConfiguration.ipcConfigPath ? 'disconnected' : 'invalid-config');
  const localAdapter = runtimeConfiguration.ipcConfigPath
    ? new LocalAriadneAdapter({
        configPath: runtimeConfiguration.ipcConfigPath,
        onStateChanged: updateAdapterStatus,
      })
    : null;
  localAdapter?.start();
  const eventCapture: VsCodeObservedEventCapture = createVsCodeObservedEventCapture({
    retentionMs: runtimeConfiguration.retentionMs,
    maxEvents: runtimeConfiguration.maxEvents,
  });
  const lifecycle = new InvestigationLifecycleService({
    storageDir: context.globalStorageUri.fsPath,
    capture: eventCapture,
    stateStore: context.workspaceState,
    autoSaveDebounceMs: runtimeConfiguration.autoSaveDebounceMs,
    onAutoSaveStatusChanged: (status) => {
      if (status.status === 'error') {
        if (warnedAutoSaveWorkspaces.has(status.workspace)) {
          return;
        }

        warnedAutoSaveWorkspaces.add(status.workspace);
        void vscode.window.showWarningMessage(
          'Ariadne: Autosave failed for an active investigation. Tracking continues, but recent progress may be lost until save recovers.',
        );
        return;
      }

      if (!warnedAutoSaveWorkspaces.has(status.workspace)) {
        return;
      }

      warnedAutoSaveWorkspaces.delete(status.workspace);
      void vscode.window.showInformationMessage(
        'Ariadne: Autosave recovered for the active investigation.',
      );
    },
  });
  activeLifecycleService = lifecycle;
  const { opener: snapshotOpener, disposable: snapshotProvider } = createResumeSnapshotOpener({
    storageDir: context.globalStorageUri.fsPath,
  });
  const lifecycleEventSubscription = eventCapture.onDidObserveEvent((event) => {
    lifecycle.recordObservedEvent(event);
    localAdapter?.observe(event);
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
    adapterStatus,
    localAdapter ?? new vscode.Disposable(() => undefined),
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
