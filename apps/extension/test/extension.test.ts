import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { activate, deactivate } from '../src/extension';
import { GitGraphPanel } from '../src/webview/GitGraphPanel';
import { LineHistoryPanel } from '../src/blame/LineHistoryPanel';
import { GitRepository } from '@git-graph/git-core';
import {
  MockTextDocument,
  MockTextEditor,
  Position,
  Selection,
  registeredCommands,
} from './__mocks__/vscode';

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

  it('registers blame and line history commands', () => {
    const subscriptions: vscode.Disposable[] = [];
    const mockContext = {
      subscriptions,
      extensionUri: vscode.Uri.file('/fake/extension/path'),
    } as unknown as vscode.ExtensionContext;

    activate(mockContext);

    expect(registeredCommands.has('gitGraph.toggleBlame')).toBe(true);
    expect(registeredCommands.has('gitGraph.revealCommit')).toBe(true);
    expect(registeredCommands.has('gitGraph.viewLineHistory')).toBe(true);
  });

  it('opens the line history panel for the active editor selection', async () => {
    const getLineHistory = vi.fn().mockResolvedValue({
      filePath: 'src/a.ts',
      startLine: 1,
      endLine: 2,
      entries: [
        {
          sha: 'abcdef1234567890abcdef1234567890abcdef12',
          shortSha: 'abcdef1',
          author: 'Alice',
          authorEmail: 'alice@example.com',
          timestamp: 1_700_000_000,
          subject: 'feat: history',
          filePath: 'src/a.ts',
          diff: '@@ -1,2 +1,2 @@\n-a\n+b',
        },
      ],
    });
    vi.spyOn(GitRepository, 'open').mockResolvedValue({
      id: 'repo-1',
      rootPath: '/repo',
      getLineHistory,
    } as unknown as GitRepository);

    const document = new MockTextDocument('/repo/src/a.ts', 'a\nb\nc');
    const editor = new MockTextEditor(
      document,
      new Selection(new Position(0, 0), new Position(1, 1)),
    );
    (vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = editor;

    const subscriptions: vscode.Disposable[] = [];
    activate({
      subscriptions,
      extensionUri: vscode.Uri.file('/fake/extension/path'),
    } as unknown as vscode.ExtensionContext);

    try {
      await vscode.commands.executeCommand('gitGraph.viewLineHistory');

      expect(getLineHistory).toHaveBeenCalledWith('src/a.ts', 1, 2);
      expect(LineHistoryPanel.currentPanel).toBeDefined();
      expect(LineHistoryPanel.currentPanel?.panel.webview.html).toContain('feat: history');
    } finally {
      LineHistoryPanel.currentPanel?.dispose();
      (vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = undefined;
      vi.restoreAllMocks();
    }
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
