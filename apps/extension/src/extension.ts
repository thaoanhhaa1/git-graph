import * as vscode from 'vscode';
import { registerCommands } from './commands/registerCommands';
import { GitGraphStatusBar } from './statusbar/GitGraphStatusBar';

const gitGraphViewType = 'gitGraph.view';

let statusBar: GitGraphStatusBar | undefined;

export function activate(context: vscode.ExtensionContext): void {
  // Register commands
  registerCommands(context);

  // Register Live Status Bar item
  statusBar = new GitGraphStatusBar();
  context.subscriptions.push(statusBar);

  // Register WebviewPanelSerializer to restore panel on window reload
  if (vscode.window.registerWebviewPanelSerializer) {
    const serializerDisposable = vscode.window.registerWebviewPanelSerializer(gitGraphViewType, {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
        const { GitGraphPanel } = await import('./webview/GitGraphPanel');
        GitGraphPanel.revive(webviewPanel, context.extensionUri);
      },
    });
    context.subscriptions.push(serializerDisposable);
  }
}

export async function deactivate(): Promise<void> {
  if (statusBar) {
    statusBar.dispose();
    statusBar = undefined;
  }
  const { GitGraphPanel } = await import('./webview/GitGraphPanel');
  if (GitGraphPanel.currentPanel) {
    GitGraphPanel.currentPanel.dispose();
  }
}
