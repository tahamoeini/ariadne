import * as vscode from 'vscode';
import { GitSnapshot, Investigation } from '../domain';
import { captureGitSnapshot } from '../git';
import { loadInvestigation } from '../storage';
import { buildMissingInvestigationContent, buildResumeSnapshotContent } from './resumeSnapshot';

export interface ResumeSnapshotOpener {
  openInvestigation(investigation: Pick<Investigation, 'id' | 'name' | 'savedAt'>): Promise<void>;
  forgetInvestigation(investigationId: string): void;
  forgetAllInvestigations(): void;
}

export interface ResumeSnapshotProviderOptions {
  storageDir: string;
  captureCurrentGitSnapshot?: (
    targetPath: string,
  ) => GitSnapshot | null | PromiseLike<GitSnapshot | null>;
  fileExists?: (filePath: string) => boolean;
}

const RESUME_SNAPSHOT_SCHEME = 'repotrail-snapshot';

function parseInvestigationId(query: string): string | null {
  const params = new URLSearchParams(query);
  const investigationId = params.get('id');
  return investigationId?.trim() || null;
}

function toSnapshotPath(displayName: string, investigationId: string): string {
  const baseName = (displayName.trim() || investigationId)
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `/${baseName || 'resume-snapshot'}-${investigationId}.md`;
}

class ResumeSnapshotContentProvider
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  private readonly contentCache = new Map<string, string>();
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(private readonly options: ResumeSnapshotProviderOptions) {}

  async buildContent(
    uri: vscode.Uri,
    investigation?: Investigation | null,
  ): Promise<string> {
    const investigationId = parseInvestigationId(uri.query);
    if (!investigationId) {
      const content = buildMissingInvestigationContent('unknown');
      this.cacheContent(uri, content);
      return content;
    }

    const resolvedInvestigation = investigation ?? loadInvestigation(this.options.storageDir, investigationId);
    if (!resolvedInvestigation) {
      const content = buildMissingInvestigationContent(investigationId);
      this.cacheContent(uri, content);
      return content;
    }

    const currentGitSnapshot = await (this.options.captureCurrentGitSnapshot ?? captureGitSnapshot)(
      resolvedInvestigation.snapshot.lastLocation?.filePath ??
        resolvedInvestigation.repository ??
        resolvedInvestigation.workspace,
    );

    const content = buildResumeSnapshotContent(resolvedInvestigation, currentGitSnapshot, {
      fileExists: this.options.fileExists,
    });
    this.cacheContent(uri, content);
    return content;
  }

  cacheContent(uri: vscode.Uri, content: string): void {
    const key = uri.toString();
    const previous = this.contentCache.get(key);
    this.contentCache.set(key, content);
    if (previous !== undefined && previous !== content) {
      this.onDidChangeEmitter.fire(uri);
    }
  }

  forgetInvestigation(investigationId: string): void {
    for (const key of Array.from(this.contentCache.keys())) {
      const uri = vscode.Uri.parse(key);
      if (parseInvestigationId(uri.query) !== investigationId) {
        continue;
      }

      this.contentCache.delete(key);
      this.onDidChangeEmitter.fire(uri);
    }
  }

  forgetAllInvestigations(): void {
    for (const key of Array.from(this.contentCache.keys())) {
      const uri = vscode.Uri.parse(key);
      this.contentCache.delete(key);
      this.onDidChangeEmitter.fire(uri);
    }
  }

  provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
    const cached = this.contentCache.get(uri.toString());
    if (cached) {
      return cached;
    }

    return this.buildContent(uri);
  }

  dispose(): void {
    this.contentCache.clear();
    this.onDidChangeEmitter.dispose();
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
          path: toSnapshotPath(investigation.name, investigation.id),
          query: new URLSearchParams({
            id: investigation.id,
          }).toString(),
        });
        await provider.buildContent(uri, fullInvestigation);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: false });
      },
      forgetInvestigation(investigationId: string): void {
        provider.forgetInvestigation(investigationId);
      },
      forgetAllInvestigations(): void {
        provider.forgetAllInvestigations();
      },
    },
    disposable: vscode.Disposable.from(registration, provider),
  };
}
