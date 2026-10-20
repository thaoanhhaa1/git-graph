import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { activate, deactivate } from '../src/extension';
import { GitGraphPanel } from '../src/webview/GitGraphPanel';

describe('extension skeleton', () => {
  beforeEach(async () => {
    await deactivate();
  });

  afterEach(async () => {
    await deactivate();
  });

  it('exports activate and deactivate lifecycle functions', () => {
    expect(typeof activate).toBe('function');
    expect(typeof deactivate).toBe('function');
  });

  it('registers gitGraph.openGraph command and webview serializer on activate', async () => {
    const subscriptions: vscode.Disposable[] = [];
    const mockContext = {
      subscriptions,
      extensionUri: vscode.Uri.file('/fake/extension/path'),
    } as unknown as vscode.ExtensionContext;

    activate(mockContext);

    expect(subscriptions.length).toBeGreaterThanOrEqual(2);

    // Test command triggers GitGraphPanel.createOrShow
    expect(GitGraphPanel.currentPanel).toBeUndefined();
    await vscode.commands.executeCommand('gitGraph.openGraph');
    expect(GitGraphPanel.currentPanel).toBeDefined();

    // Test deactivate cleans up panel
    await deactivate();
    expect(GitGraphPanel.currentPanel).toBeUndefined();
  });
});
