import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('repotrail.hello', () => {
    vscode.window.showInformationMessage('RepoTrail is active!');
  });

  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  // Clean-up will go here when needed.
}
