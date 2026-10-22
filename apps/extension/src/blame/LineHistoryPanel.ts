import * as path from 'node:path';
import * as vscode from 'vscode';
import type { LineHistoryResult } from '@git-graph/shared';
import { getNonce } from '../webview/getWebviewHtml';
import { getLineHistoryHtml } from './LineHistoryHtml';

export class LineHistoryPanel implements vscode.Disposable {
  public static currentPanel: LineHistoryPanel | undefined;
  public static readonly viewType = 'gitGraph.lineHistory';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _repositoryId: string;
  private _disposed = false;

  public static show(result: LineHistoryResult, repositoryId: string): LineHistoryPanel {
    if (LineHistoryPanel.currentPanel) {
      LineHistoryPanel.currentPanel.update(result, repositoryId);
      LineHistoryPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
      return LineHistoryPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      LineHistoryPanel.viewType,
      `Line History: ${path.basename(result.filePath)}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    LineHistoryPanel.currentPanel = new LineHistoryPanel(panel, result, repositoryId);
    return LineHistoryPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, result: LineHistoryResult, repositoryId: string) {
    this._panel = panel;
    this._repositoryId = repositoryId;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        void this.handleMessage(message);
      },
      null,
      this._disposables,
    );

    this.update(result, repositoryId);
  }

  public get panel(): vscode.WebviewPanel {
    return this._panel;
  }

  public update(result: LineHistoryResult, repositoryId: string): void {
    if (this._disposed) {
      return;
    }
    this._repositoryId = repositoryId;
    this._panel.title = `Line History: ${path.basename(result.filePath)}`;
    this._panel.webview.html = getLineHistoryHtml(
      this._panel.webview,
      getNonce(),
      result,
      repositoryId,
    );
  }

  public dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    if (LineHistoryPanel.currentPanel === this) {
      LineHistoryPanel.currentPanel = undefined;
    }

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }

    this._panel.dispose();
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object') {
      return;
    }

    const candidate = message as { type?: unknown; sha?: unknown; repositoryId?: unknown };
    if (candidate.type !== 'revealCommit' || typeof candidate.sha !== 'string') {
      return;
    }

    const repositoryId =
      typeof candidate.repositoryId === 'string' ? candidate.repositoryId : this._repositoryId;

    await vscode.commands.executeCommand('gitGraph.revealCommit', {
      sha: candidate.sha,
      repositoryId,
    });
  }
}
