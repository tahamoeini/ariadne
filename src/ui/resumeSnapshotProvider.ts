import * as vscode from 'vscode';
import { GitSnapshot, Investigation } from '../domain';
import { captureGitSnapshot } from '../git';
import { loadInvestigation } from '../storage';
import { buildMissingInvestigationContent, buildResumeSnapshotContent } from './resumeSnapshot';

export interface ResumeSnapshotOpener {
  openInvestigation(investigation: Pick<Investigation, 'id' | 'name' | 'savedAt'>): Promise<void>;
}

export interface ResumeSnapshotProviderOptions {
  storageDir: string;
  captureCurrentGitSnapshot?: (targetPath: string) => GitSnapshot | null;
  fileExists?: (filePath: string) => boolean;
}

const RESUME_SNAPSHOT_SCHEME = 'repotrail-snapshot';

function parseInvestigationId(query: string): string | null {
  const params = new URLSearchParams(query);
  const investigationId = params.get('id');
  return investigationId?.trim() || null;
}

function toSnapshotPath(displayName: string, investigationId: string, savedAt: string): string {
  const baseName = (displayName.trim() || investigationId)
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const versionSuffix = savedAt.replace(/[^\dT]/g, '').slice(0, 15);
  return `/${baseName || 'resume-snapshot'}-${versionSuffix || 'snapshot'}.md`;
}

class ResumeSnapshotContentProvider implements vscode.TextDocumentContentProvider {
  private readonly contentCache = new Map<string, string>();

  constructor(private readonly options: ResumeSnapshotProviderOptions) {}

  cacheContent(uri: vscode.Uri, content: string): void {
    this.contentCache.set(uri.toString(), content);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const cached = this.contentCache.get(uri.toString());
    if (cached) {
      return cached;
    }

    const investigationId = parseInvestigationId(uri.query);
    if (!investigationId) {
      const content = buildMissingInvestigationContent('unknown');
      this.cacheContent(uri, content);
      return content;
    }

    const investigation = loadInvestigation(this.options.storageDir, investigationId);
    if (!investigation) {
      const content = buildMissingInvestigationContent(investigationId);
      this.cacheContent(uri, content);
      return content;
    }

    const currentGitSnapshot = (this.options.captureCurrentGitSnapshot ?? captureGitSnapshot)(
      investigation.snapshot.lastLocation?.filePath ?? investigation.repository ?? investigation.workspace,
    );

    const content = buildResumeSnapshotContent(investigation, currentGitSnapshot, {
      fileExists: this.options.fileExists,
    });
    this.cacheContent(uri, content);
    return content;
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
      async openInvestigation(investigation): Promise<void> {
        const fullInvestigation = loadInvestigation(options.storageDir, investigation.id);
        const uri = vscode.Uri.from({
          scheme: RESUME_SNAPSHOT_SCHEME,
          path: toSnapshotPath(investigation.name, investigation.id, investigation.savedAt),
          query: new URLSearchParams({
            id: investigation.id,
          }).toString(),
        });
        if (fullInvestigation) {
          const currentGitSnapshot = (options.captureCurrentGitSnapshot ?? captureGitSnapshot)(
            fullInvestigation.snapshot.lastLocation?.filePath ??
              fullInvestigation.repository ??
              fullInvestigation.workspace,
          );
          provider.cacheContent(
            uri,
            buildResumeSnapshotContent(fullInvestigation, currentGitSnapshot, {
              fileExists: options.fileExists,
            }),
          );
        } else {
          provider.cacheContent(uri, buildMissingInvestigationContent(investigation.id));
        }
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: false });
      },
    },
    disposable: registration,
  };
}
