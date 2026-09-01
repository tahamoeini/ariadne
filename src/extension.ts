import * as vscode from 'vscode';
import {
  createVsCodeObservedEventCapture,
  RepoTrailDebugApi as CaptureDebugApi,
  VsCodeObservedEventCapture,
} from './capture/vscodeEventCapture';
import { createResumeSnapshotOpener } from './ui';
import {
  InvestigationLifecycleDebugApi,
  InvestigationLifecycleService,
  registerInvestigationCommands,
} from './commands';

export interface RepoTrailExtensionDebugApi
  extends CaptureDebugApi, InvestigationLifecycleDebugApi {}

export interface RepoTrailExtensionApi {
  debug: RepoTrailExtensionDebugApi;
}

export function activate(context: vscode.ExtensionContext): RepoTrailExtensionApi {
  const eventCapture: VsCodeObservedEventCapture = createVsCodeObservedEventCapture();
  const lifecycle = new InvestigationLifecycleService({
    storageDir: context.globalStorageUri.fsPath,
    capture: eventCapture,
    stateStore: context.workspaceState,
  });
  const { opener: snapshotOpener, disposable: snapshotProvider } = createResumeSnapshotOpener({
    storageDir: context.globalStorageUri.fsPath,
  });
  const lifecycleEventSubscription = eventCapture.onDidObserveEvent((event) => {
    lifecycle.recordObservedEvent(event);
  });
  const disposable = vscode.commands.registerCommand('repotrail.hello', () => {
    vscode.window.showInformationMessage('RepoTrail is active!');
  });
  const lifecycleCommands = registerInvestigationCommands(lifecycle, snapshotOpener);

  context.subscriptions.push(
    disposable,
    lifecycleCommands,
    lifecycleEventSubscription,
    eventCapture,
    snapshotProvider,
  );

  return {
    debug: {
      ...eventCapture.debug,
      getActiveInvestigation(workspace?: string) {
        return lifecycle.getActiveInvestigation(workspace);
      },
      listInvestigations() {
        return lifecycle.listInvestigations();
      },
      clearInvestigations() {
        return lifecycle.clearInvestigations();
      },
    },
  };
}

export function deactivate(): void {
  // Clean-up will go here when needed.
}
