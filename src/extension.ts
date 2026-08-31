import * as vscode from 'vscode';
import { createVsCodeObservedEventCapture, RepoTrailDebugApi, VsCodeObservedEventCapture } from './capture';

export interface RepoTrailExtensionApi {
  debug: RepoTrailDebugApi;
}

export function activate(context: vscode.ExtensionContext): RepoTrailExtensionApi {
  const eventCapture: VsCodeObservedEventCapture = createVsCodeObservedEventCapture();
  const disposable = vscode.commands.registerCommand('repotrail.hello', () => {
    vscode.window.showInformationMessage('RepoTrail is active!');
  });

  context.subscriptions.push(disposable, eventCapture);

  return {
    debug: eventCapture.debug,
  };
}

export function deactivate(): void {
  // Clean-up will go here when needed.
}
