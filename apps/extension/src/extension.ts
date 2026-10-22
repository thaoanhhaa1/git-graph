import * as vscode from 'vscode';
import { registerCommands } from './commands/registerCommands';
import { GitGraphStatusBar } from './statusbar/GitGraphStatusBar';
import { BlameDecorationProvider } from './blame/BlameDecorationProvider';
import { clearRecordedMessages, getRecordedMessages, isE2EEnabled } from './e2e/e2eBridge';

const gitGraphViewType = 'gitGraph.view';

let statusBar: GitGraphStatusBar | undefined;
let blameProvider: BlameDecorationProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  blameProvider = new BlameDecorationProvider();
  context.subscriptions.push(blameProvider);

  // Register commands
  registerCommands(context, { blameProvider });

  // Register Live Status Bar item
  statusBar = new GitGraphStatusBar();
  context.subscriptions.push(statusBar);

  registerE2ECommands(context);

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

function registerE2ECommands(context: vscode.ExtensionContext): void {
  if (!isE2EEnabled()) {
    return;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gitGraph.__e2e.handleWebviewMessage',
      async (message: unknown) => {
        const { GitGraphPanel } = await import('./webview/GitGraphPanel');
        await GitGraphPanel.currentPanel?.handleWebviewMessageForTesting(message);
      },
    ),
    vscode.commands.registerCommand('gitGraph.__e2e.getPostedMessages', () =>
      getRecordedMessages(),
    ),
    vscode.commands.registerCommand('gitGraph.__e2e.clearPostedMessages', () =>
      clearRecordedMessages(),
    ),
    vscode.commands.registerCommand('gitGraph.__e2e.getPanelState', async () => {
      const { GitGraphPanel } = await import('./webview/GitGraphPanel');
      const panel = GitGraphPanel.currentPanel;
      return {
        open: Boolean(panel),
        repositories: panel?.repositoryManager.getRepositories() ?? [],
        activeRepositoryId: panel?.repositoryManager.getActiveRepository()?.id,
      };
    }),
  );
}

export async function deactivate(): Promise<void> {
  if (statusBar) {
    statusBar.dispose();
    statusBar = undefined;
  }
  if (blameProvider) {
    blameProvider.dispose();
    blameProvider = undefined;
  }
  const { GitGraphPanel } = await import('./webview/GitGraphPanel');
  if (GitGraphPanel.currentPanel) {
    GitGraphPanel.currentPanel.dispose();
  }
  const { LineHistoryPanel } = await import('./blame/LineHistoryPanel');
  LineHistoryPanel.currentPanel?.dispose();
}
