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

export function activate(context: vscode.ExtensionContext): void {
  const eventCapture: VsCodeObservedEventCapture = createVsCodeObservedEventCapture();
  const lifecycle = new InvestigationLifecycleService({
    storageDir: context.globalStorageUri.fsPath,
    capture: eventCapture,
    stateStore: context.workspaceState,
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
  } finally {
    activeLifecycleService = null;
  }
}
