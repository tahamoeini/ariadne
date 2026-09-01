import * as vscode from 'vscode';
import { GitSnapshot } from '../domain';
import { captureGitSnapshot } from '../git';
import { loadInvestigation } from '../storage';
import { buildMissingInvestigationContent, buildResumeSnapshotContent } from './resumeSnapshot';

export interface ResumeSnapshotOpener {
  openInvestigation(investigationId: string, displayName?: string): Promise<void>;
}

export interface ResumeSnapshotProviderOptions {
  storageDir: string;
  captureCurrentGitSnapshot?: (targetPath: string) => GitSnapshot;
  fileExists?: (filePath: string) => boolean;
}

const RESUME_SNAPSHOT_SCHEME = 'repotrail-snapshot';

function parseInvestigationId(query: string): string | null {
  const params = new URLSearchParams(query);
  const investigationId = params.get('id');
  return investigationId?.trim() || null;
}

function toSnapshotPath(displayName: string | undefined, investigationId: string): string {
  const baseName = (displayName?.trim() || investigationId)
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `/${baseName || 'resume-snapshot'}.md`;
}

class ResumeSnapshotContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly options: ResumeSnapshotProviderOptions) {}

  provideTextDocumentContent(uri: vscode.Uri): string {
    const investigationId = parseInvestigationId(uri.query);
    if (!investigationId) {
      return buildMissingInvestigationContent('unknown');
    }

    const investigation = loadInvestigation(this.options.storageDir, investigationId);
    if (!investigation) {
      return buildMissingInvestigationContent(investigationId);
    }

    const currentGitSnapshot = (this.options.captureCurrentGitSnapshot ?? captureGitSnapshot)(
      investigation.snapshot.lastLocation?.filePath ?? investigation.repository ?? investigation.workspace,
    );

    return buildResumeSnapshotContent(investigation, currentGitSnapshot, {
      fileExists: this.options.fileExists,
    });
  }
}

export function createResumeSnapshotOpener(
  options: ResumeSnapshotProviderOptions,
): { opener: ResumeSnapshotOpener; disposable: vscode.Disposable } {
  const provider = new ResumeSnapshotContentProvider(options);
  const registration = vscode.workspace.registerTextDocumentContentProvider(
    RESUME_SNAPSHOT_SCHEME,
    provider,
  );

  return {
    opener: {
      async openInvestigation(investigationId: string, displayName?: string): Promise<void> {
        const uri = vscode.Uri.from({
          scheme: RESUME_SNAPSHOT_SCHEME,
          path: toSnapshotPath(displayName, investigationId),
          query: new URLSearchParams({
            id: investigationId,
            openedAt: new Date().toISOString(),
          }).toString(),
        });
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: false });
      },
    },
    disposable: registration,
  };
}
