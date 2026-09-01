import * as vscode from 'vscode';
import { Investigation } from '../domain';
import { CreateInvestigationOptions, InvestigationLifecycleService } from './investigationLifecycle';
import { ResumeSnapshotOpener } from '../ui';

export const COMMAND_START_INVESTIGATION = 'repotrail.startInvestigation';
export const COMMAND_SAVE_RECENT_ACTIVITY = 'repotrail.saveRecentActivityAsInvestigation';
export const COMMAND_UPDATE_CHECKPOINT = 'repotrail.updateCheckpoint';
export const COMMAND_SAVE_AND_STOP = 'repotrail.saveAndStopInvestigation';
export const COMMAND_LIST_INVESTIGATIONS = 'repotrail.listInvestigations';
export const COMMAND_DELETE_INVESTIGATION = 'repotrail.deleteInvestigation';
export const COMMAND_OPEN_RESUME_SNAPSHOT = 'repotrail.openResumeSnapshot';

interface CreateInvestigationCommandOptions {
  workspacePath?: string;
  name?: string;
  checkpointText?: string | null;
}

interface SaveAndStopCommandOptions {
  workspacePath?: string;
}

interface ListInvestigationsCommandOptions {
  quiet?: boolean;
}

interface DeleteInvestigationCommandOptions {
  id?: string;
  skipConfirmation?: boolean;
}

interface OpenResumeSnapshotCommandOptions {
  id?: string;
}

interface InvestigationQuickPickItem extends vscode.QuickPickItem {
  investigation: Investigation;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected RepoTrail error.';
}

function trimToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function resolveWorkspacePath(explicitPath?: string): Promise<string | null> {
  if (explicitPath) {
    return explicitPath;
  }

  const activeDocument = vscode.window.activeTextEditor?.document;
  if (activeDocument?.uri.scheme === 'file') {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeDocument.uri);
    if (workspaceFolder) {
      return workspaceFolder.uri.fsPath;
    }
  }

  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (workspaceFolders.length === 0) {
    return null;
  }

  if (workspaceFolders.length === 1) {
    return workspaceFolders[0].uri.fsPath;
  }

  const selection = await vscode.window.showQuickPick(
    workspaceFolders.map((workspaceFolder) => ({
      label: workspaceFolder.name,
      description: workspaceFolder.uri.fsPath,
      workspacePath: workspaceFolder.uri.fsPath,
    })),
    {
      title: 'RepoTrail: Select Workspace',
      matchOnDescription: true,
    },
  );

  return selection?.workspacePath ?? null;
}

async function promptForInvestigationName(title: string): Promise<string | undefined> {
  const name = await vscode.window.showInputBox({
    title,
    prompt: 'Name the investigation.',
    placeHolder: 'Fix refresh-token race',
    ignoreFocusOut: true,
  });

  const trimmed = name?.trim();
  return trimmed ? trimmed : undefined;
}

async function promptForCheckpoint(currentValue = ''): Promise<string | null | undefined> {
  const checkpoint = await vscode.window.showInputBox({
    title: 'RepoTrail: Checkpoint',
    prompt: 'Optional checkpoint. Leave blank to skip or clear it.',
    value: currentValue,
    placeHolder: 'Current hypothesis, unresolved question, or next step',
    ignoreFocusOut: true,
  });

  if (checkpoint === undefined) {
    return undefined;
  }

  return trimToNull(checkpoint);
}

function toQuickPickItem(investigation: Investigation): InvestigationQuickPickItem {
  const details = [
    `Saved ${investigation.savedAt}`,
    investigation.repository ? `Repo ${investigation.repository}` : null,
    investigation.checkpoint ? 'Checkpoint' : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' • ');

  return {
    label: investigation.name,
    description: investigation.workspace,
    detail: details,
    investigation,
  };
}

async function pickInvestigation(
  investigations: Investigation[],
  title: string,
): Promise<Investigation | undefined> {
  const selected = await vscode.window.showQuickPick(
    investigations.map(toQuickPickItem),
    {
      title,
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );

  return selected?.investigation;
}

async function collectCreateOptions(
  title: string,
  options: CreateInvestigationCommandOptions,
): Promise<CreateInvestigationOptions | null> {
  const workspace = await resolveWorkspacePath(options.workspacePath);
  if (!workspace) {
    vscode.window.showInformationMessage('RepoTrail: Open a workspace or file first.');
    return null;
  }

  const name = options.name?.trim() || (await promptForInvestigationName(title));
  if (!name) {
    return null;
  }

  let checkpointText = options.checkpointText;
  if (checkpointText === undefined) {
    checkpointText = await promptForCheckpoint();
    if (checkpointText === undefined) {
      return null;
    }
  }

  return {
    workspace,
    name,
    checkpointText: trimToNull(checkpointText),
  };
}

export function registerInvestigationCommands(
  lifecycle: InvestigationLifecycleService,
  snapshotOpener: ResumeSnapshotOpener,
): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand(
      COMMAND_START_INVESTIGATION,
      async (options: CreateInvestigationCommandOptions = {}) => {
        const createOptions = await collectCreateOptions('RepoTrail: Start Investigation', options);
        if (!createOptions) {
          return undefined;
        }

        try {
          const investigation = await lifecycle.startInvestigation(createOptions);
          vscode.window.showInformationMessage(
            `RepoTrail: Started investigation "${investigation.name}".`,
          );
          return investigation;
        } catch (error) {
          vscode.window.showErrorMessage(`RepoTrail: ${toErrorMessage(error)}`);
          return undefined;
        }
      },
    ),
    vscode.commands.registerCommand(
      COMMAND_SAVE_RECENT_ACTIVITY,
      async (options: CreateInvestigationCommandOptions = {}) => {
        const createOptions = await collectCreateOptions(
          'RepoTrail: Save Recent Activity as Investigation',
          options,
        );
        if (!createOptions) {
          return undefined;
        }

        try {
          const investigation = await lifecycle.saveRecentActivityAsInvestigation(createOptions);
          if (!investigation) {
            vscode.window.showInformationMessage('RepoTrail: No recent activity is available to save.');
            return null;
          }

          vscode.window.showInformationMessage(
            `RepoTrail: Saved recent activity as "${investigation.name}".`,
          );
          return investigation;
        } catch (error) {
          vscode.window.showErrorMessage(`RepoTrail: ${toErrorMessage(error)}`);
          return undefined;
        }
      },
    ),
    vscode.commands.registerCommand(
      COMMAND_UPDATE_CHECKPOINT,
      async (options: CreateInvestigationCommandOptions = {}) => {
        const workspace = await resolveWorkspacePath(options.workspacePath);
        if (!workspace) {
          vscode.window.showInformationMessage('RepoTrail: Open a workspace or file first.');
          return undefined;
        }

        const activeInvestigation = lifecycle.getActiveInvestigation(workspace);
        if (!activeInvestigation) {
          vscode.window.showInformationMessage(
            'RepoTrail: No active investigation is available for this workspace.',
          );
          return null;
        }

        let checkpointText = options.checkpointText;
        if (checkpointText === undefined) {
          checkpointText = await promptForCheckpoint(activeInvestigation.checkpoint?.text ?? '');
          if (checkpointText === undefined) {
            return undefined;
          }
        }

        try {
          const updated = await lifecycle.updateCheckpoint(workspace, trimToNull(checkpointText));
          if (!updated) {
            vscode.window.showInformationMessage(
              'RepoTrail: No active investigation is available for this workspace.',
            );
            return null;
          }

          vscode.window.showInformationMessage(
            updated.checkpoint
              ? `RepoTrail: Updated checkpoint for "${updated.name}".`
              : `RepoTrail: Cleared checkpoint for "${updated.name}".`,
          );
          return updated;
        } catch (error) {
          vscode.window.showErrorMessage(`RepoTrail: ${toErrorMessage(error)}`);
          return undefined;
        }
      },
    ),
    vscode.commands.registerCommand(
      COMMAND_SAVE_AND_STOP,
      async (options: SaveAndStopCommandOptions = {}) => {
        const workspace = await resolveWorkspacePath(options.workspacePath);
        if (!workspace) {
          vscode.window.showInformationMessage('RepoTrail: Open a workspace or file first.');
          return undefined;
        }

        try {
          const investigation = await lifecycle.saveAndStopInvestigation(workspace);
          if (!investigation) {
            vscode.window.showInformationMessage(
              'RepoTrail: No active investigation is available for this workspace.',
            );
            return null;
          }

          vscode.window.showInformationMessage(
            `RepoTrail: Saved and stopped "${investigation.name}".`,
          );
          return investigation;
        } catch (error) {
          vscode.window.showErrorMessage(`RepoTrail: ${toErrorMessage(error)}`);
          return undefined;
        }
      },
    ),
    vscode.commands.registerCommand(
      COMMAND_OPEN_RESUME_SNAPSHOT,
      async (options: OpenResumeSnapshotCommandOptions = {}) => {
        const investigations = lifecycle.listInvestigations();
        if (investigations.length === 0) {
          vscode.window.showInformationMessage('RepoTrail: No saved investigations were found.');
          return null;
        }

        const investigation =
          investigations.find((candidate) => candidate.id === options.id) ??
          (await pickInvestigation(investigations, 'RepoTrail: Open Resume Snapshot'));

        if (!investigation) {
          return undefined;
        }

        try {
          await snapshotOpener.openInvestigation(investigation.id, investigation.name);
          return investigation;
        } catch (error) {
          vscode.window.showErrorMessage(`RepoTrail: ${toErrorMessage(error)}`);
          return undefined;
        }
      },
    ),
    vscode.commands.registerCommand(
      COMMAND_LIST_INVESTIGATIONS,
      async (options: ListInvestigationsCommandOptions = {}) => {
        const investigations = lifecycle.listInvestigations();
        if (investigations.length === 0) {
          vscode.window.showInformationMessage('RepoTrail: No saved investigations were found.');
          return [];
        }

        if (!options.quiet) {
          const investigation = await pickInvestigation(
            investigations,
            'RepoTrail: Saved Investigations',
          );
          if (investigation) {
            await snapshotOpener.openInvestigation(investigation.id, investigation.name);
          }
        }

        return investigations;
      },
    ),
    vscode.commands.registerCommand(
      COMMAND_DELETE_INVESTIGATION,
      async (options: DeleteInvestigationCommandOptions = {}) => {
        const investigations = lifecycle.listInvestigations();
        if (investigations.length === 0) {
          vscode.window.showInformationMessage('RepoTrail: No saved investigations were found.');
          return false;
        }

        const investigation =
          investigations.find((candidate) => candidate.id === options.id) ??
          (await pickInvestigation(investigations, 'RepoTrail: Delete Investigation'));

        if (!investigation) {
          return false;
        }

        if (!options.skipConfirmation) {
          const confirmed = await vscode.window.showWarningMessage(
            `Delete investigation "${investigation.name}"?`,
            { modal: true },
            'Delete',
          );

          if (confirmed !== 'Delete') {
            return false;
          }
        }

        try {
          const deleted = await lifecycle.deleteInvestigation(investigation.id);
          if (deleted) {
            vscode.window.showInformationMessage(
              `RepoTrail: Deleted investigation "${investigation.name}".`,
            );
          }
          return deleted;
        } catch (error) {
          vscode.window.showErrorMessage(`RepoTrail: ${toErrorMessage(error)}`);
          return false;
        }
      },
    ),
  );

  return vscode.Disposable.from(...disposables);
}
