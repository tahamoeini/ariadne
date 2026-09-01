import * as fs from 'fs';
import * as vscode from 'vscode';
import { Investigation } from '../domain';
import {
  CreateInvestigationOptions,
  InvestigationLifecycleService,
  MAX_CHECKPOINT_LENGTH,
  MAX_INVESTIGATION_NAME_LENGTH,
} from './investigationLifecycle';
import {
  buildResumePlan,
  buildResumeResultMessage,
  ResumeExecutionResult,
} from './resumePlan';
import { ResumeSnapshotOpener } from '../ui';

export const COMMAND_START_INVESTIGATION = 'repotrail.startInvestigation';
export const COMMAND_SAVE_RECENT_ACTIVITY = 'repotrail.saveRecentActivityAsInvestigation';
export const COMMAND_UPDATE_CHECKPOINT = 'repotrail.updateCheckpoint';
export const COMMAND_SAVE_AND_STOP = 'repotrail.saveAndStopInvestigation';
export const COMMAND_LIST_INVESTIGATIONS = 'repotrail.listInvestigations';
export const COMMAND_DELETE_INVESTIGATION = 'repotrail.deleteInvestigation';
export const COMMAND_DELETE_ALL_DATA = 'repotrail.deleteAllData';
export const COMMAND_OPEN_RESUME_SNAPSHOT = 'repotrail.openResumeSnapshot';
export const COMMAND_RESUME_INVESTIGATION = 'repotrail.resumeInvestigation';
export const COMMAND_SHOW_STORAGE_LOCATION = 'repotrail.showStorageLocation';

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

interface DeleteAllDataCommandOptions {
  skipConfirmation?: boolean;
}

interface OpenResumeSnapshotCommandOptions {
  id?: string;
}

interface ResumeInvestigationCommandOptions {
  id?: string;
  maxFilesToOpen?: number;
}

interface ShowStorageLocationCommandOptions {
  revealInOs?: boolean;
}

interface InvestigationQuickPickItem extends vscode.QuickPickItem {
  investigation: Investigation;
}

interface RegisterInvestigationCommandsOptions {
  clearRecentActivity?: () => void;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected RepoTrail error.';
}

function showCommandError(action: string, error: unknown): void {
  void vscode.window.showErrorMessage(`RepoTrail: Failed to ${action}: ${toErrorMessage(error)}`);
}

function trimToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateBoundedText(
  value: string,
  label: string,
  maxLength: number,
): string | undefined {
  if (value.trim().length === 0) {
    return undefined;
  }

  if (value.trim().length > maxLength) {
    return `${label} must be ${maxLength} characters or fewer.`;
  }

  return undefined;
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
    prompt: `Name the investigation. RepoTrail saves this locally in plain text (${MAX_INVESTIGATION_NAME_LENGTH} characters max).`,
    placeHolder: 'Fix refresh-token race',
    ignoreFocusOut: true,
    validateInput(value) {
      return validateBoundedText(value, 'Investigation name', MAX_INVESTIGATION_NAME_LENGTH);
    },
  });

  const trimmed = name?.trim();
  return trimmed ? trimmed : undefined;
}

async function promptForCheckpoint(currentValue = ''): Promise<string | null | undefined> {
  const checkpoint = await vscode.window.showInputBox({
    title: 'RepoTrail: Checkpoint',
    prompt: `Optional checkpoint saved locally in plain text. Avoid secrets or large source excerpts (${MAX_CHECKPOINT_LENGTH} characters max).`,
    value: currentValue,
    placeHolder: 'Current hypothesis, unresolved question, or next step',
    ignoreFocusOut: true,
    validateInput(value) {
      return validateBoundedText(value, 'Checkpoint', MAX_CHECKPOINT_LENGTH);
    },
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

function clampPosition(
  document: vscode.TextDocument,
  line: number,
  column: number,
): vscode.Position {
  if (document.lineCount === 0) {
    return new vscode.Position(0, 0);
  }

  const targetLine = Math.min(Math.max(line - 1, 0), Math.max(document.lineCount - 1, 0));
  const lineText = document.lineAt(targetLine).text;
  const targetColumn = Math.min(Math.max(column - 1, 0), lineText.length);
  return new vscode.Position(targetLine, targetColumn);
}

async function reopenSavedFiles(investigation: Investigation, maxFilesToOpen?: number) {
  const plan = buildResumePlan(investigation, {
    currentWorkspacePaths: (vscode.workspace.workspaceFolders ?? []).map(
      (workspaceFolder) => workspaceFolder.uri.fsPath,
    ),
    maxFilesToOpen,
  });
  const reopenedFiles: string[] = [];
  const failedToOpenFiles: string[] = [];
  let revealedLocation: ResumeExecutionResult['revealedLocation'] = null;

  for (const filePath of plan.filesToOpen) {
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const editor = await vscode.window.showTextDocument(document, { preview: false });
      reopenedFiles.push(filePath);

      if (plan.targetLocation?.filePath === filePath) {
        const position = clampPosition(
          document,
          plan.targetLocation.line,
          plan.targetLocation.column,
        );
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenterIfOutsideViewport,
        );
        revealedLocation = {
          filePath,
          line: position.line + 1,
          column: position.character + 1,
        };
      }
    } catch {
      failedToOpenFiles.push(filePath);
    }
  }

  return {
    ...plan,
    reopenedFiles,
    failedToOpenFiles,
    revealedLocation,
  } satisfies ResumeExecutionResult;
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
  options: RegisterInvestigationCommandsOptions = {},
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
            `RepoTrail: Saved and started "${investigation.name}".`,
          );
          return investigation;
        } catch (error) {
          showCommandError('start the investigation', error);
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
            `RepoTrail: Saved recent activity as "${investigation.name}" and continued tracking.`,
          );
          return investigation;
        } catch (error) {
          showCommandError('save recent activity', error);
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
            'RepoTrail: No active investigation was found for this workspace.',
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
              'RepoTrail: No active investigation was found for this workspace.',
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
          showCommandError('update the checkpoint', error);
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
              'RepoTrail: No active investigation was found for this workspace.',
            );
            return null;
          }

          vscode.window.showInformationMessage(
            `RepoTrail: Saved and stopped tracking "${investigation.name}".`,
          );
          return investigation;
        } catch (error) {
          showCommandError('save and stop the investigation', error);
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
          (await pickInvestigation(investigations, 'RepoTrail: Show Resume Snapshot'));

        if (!investigation) {
          return null;
        }

        try {
          await snapshotOpener.openInvestigation(investigation);
          return investigation;
        } catch (error) {
          showCommandError('show the Resume Snapshot', error);
          return null;
        }
      },
    ),
    vscode.commands.registerCommand(
      COMMAND_SHOW_STORAGE_LOCATION,
      async (commandOptions: ShowStorageLocationCommandOptions = {}) => {
        const storageDir = lifecycle.getStorageDirectory();
        const revealInOs = commandOptions.revealInOs ?? true;
        if (revealInOs && fs.existsSync(storageDir)) {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(storageDir));
        }

        await vscode.window.showInformationMessage(`RepoTrail: Local data directory: ${storageDir}`);
        return storageDir;
      },
    ),
    vscode.commands.registerCommand(
      COMMAND_RESUME_INVESTIGATION,
      async (options: ResumeInvestigationCommandOptions = {}) => {
        const investigations = lifecycle.listInvestigations();
        if (investigations.length === 0) {
          vscode.window.showInformationMessage('RepoTrail: No saved investigations were found.');
          return null;
        }

        const investigation =
          investigations.find((candidate) => candidate.id === options.id) ??
          (await pickInvestigation(investigations, 'RepoTrail: Resume Investigation'));

        if (!investigation) {
          return null;
        }

        try {
          await snapshotOpener.openInvestigation(investigation);
          const result = await reopenSavedFiles(investigation, options.maxFilesToOpen);
          vscode.window.showInformationMessage(buildResumeResultMessage(result));
          return result;
        } catch (error) {
          showCommandError('resume the investigation', error);
          return null;
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
            try {
              await snapshotOpener.openInvestigation(investigation);
            } catch (error) {
              showCommandError('show the Resume Snapshot', error);
            }
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
            `Delete saved investigation "${investigation.name}"?`,
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
            snapshotOpener.forgetInvestigation(investigation.id);
            vscode.window.showInformationMessage(
              `RepoTrail: Deleted investigation "${investigation.name}".`,
            );
          }
          return deleted;
        } catch (error) {
          showCommandError('delete the investigation', error);
          return false;
        }
      },
    ),
    vscode.commands.registerCommand(
      COMMAND_DELETE_ALL_DATA,
      async (commandOptions: DeleteAllDataCommandOptions = {}) => {
        if (!commandOptions.skipConfirmation) {
          const confirmed = await vscode.window.showWarningMessage(
            'Delete all RepoTrail local data? This removes saved Investigations and clears in-memory activity for the current session.',
            { modal: true },
            'Delete All',
          );

          if (confirmed !== 'Delete All') {
            return 0;
          }
        }

        try {
          const deletedCount = await lifecycle.deleteAllData();
          options.clearRecentActivity?.();
          snapshotOpener.forgetAllInvestigations();
          vscode.window.showInformationMessage(
            `RepoTrail: Deleted all local data (${deletedCount} saved investigation(s)) and cleared in-memory activity.`,
          );
          return deletedCount;
        } catch (error) {
          showCommandError('delete all local data', error);
          return 0;
        }
      },
    ),
  );

  return vscode.Disposable.from(...disposables);
}
