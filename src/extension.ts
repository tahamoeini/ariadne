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
import {
  DEFAULT_INVESTIGATION_CAPTURE_PROFILE,
  normalizeInvestigationCaptureProfile,
} from './validation';

let activeLifecycleService: InvestigationLifecycleService | null = null;

export interface RepoTrailExtensionDebugApi
  extends CaptureDebugApi, InvestigationLifecycleDebugApi {}

/** @internal Testing-only debug surface; exposes raw captured metadata. */
export interface RepoTrailExtensionApi {
  debug: RepoTrailExtensionDebugApi;
}

function getConfiguredCaptureProfile() {
  return normalizeInvestigationCaptureProfile(
    vscode.workspace
      .getConfiguration('repotrail')
      .get('validationMode', DEFAULT_INVESTIGATION_CAPTURE_PROFILE),
  );
}

export function activate(context: vscode.ExtensionContext): RepoTrailExtensionApi {
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
    getDefaultCaptureProfile: getConfiguredCaptureProfile,
  });

  context.subscriptions.push(
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

export async function deactivate(): Promise<void> {
  try {
    await activeLifecycleService?.persistActiveInvestigations();
  } finally {
    activeLifecycleService = null;
  }
}
