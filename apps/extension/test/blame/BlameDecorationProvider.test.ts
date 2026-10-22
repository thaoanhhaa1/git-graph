import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlameResult } from '@git-graph/shared';
import { GitRepository } from '@git-graph/git-core';
import { BlameDecorationProvider } from '../../src/blame/BlameDecorationProvider';
import {
  MockTextDocument,
  MockTextEditor,
  Position,
  Range,
  Uri,
  activeWatchers,
  createdDecorationTypes,
  hoverProviders,
  resetMockConfiguration,
  setMockConfigurationValue,
  window,
  workspace,
} from '../__mocks__/vscode';

const SHA = 'abcdef1234567890abcdef1234567890abcdef12';

function buildBlameResult(): BlameResult {
  return {
    filePath: 'src/a.ts',
    revision: 'HEAD',
    lines: [
      {
        sha: SHA,
        shortSha: 'abcdef1',
        author: 'Alice',
        authorEmail: 'alice@example.com',
        timestamp: 1_700_000_000,
        subject: 'feat: add blame',
        lineNumber: 1,
        originalLineNumber: 1,
        content: 'const a = 1;',
      },
      {
        sha: SHA,
        shortSha: 'abcdef1',
        author: 'Alice',
        authorEmail: 'alice@example.com',
        timestamp: 1_700_000_000,
        subject: 'feat: add blame',
        lineNumber: 2,
        originalLineNumber: 2,
        content: 'const b = 2;',
      },
    ],
  };
}

describe('BlameDecorationProvider', () => {
  const getBlame = vi.fn().mockResolvedValue(buildBlameResult());
  const getCommitBody = vi.fn().mockResolvedValue('Full commit body');
  let provider: BlameDecorationProvider | undefined;

  beforeEach(() => {
    resetMockConfiguration();
    getBlame.mockReset();
    getBlame.mockResolvedValue(buildBlameResult());
    getCommitBody.mockReset();
    getCommitBody.mockResolvedValue('Full commit body');
    setMockConfigurationValue('gitGraph.blame.enabled', true);
    window.visibleTextEditors = [];
    hoverProviders.length = 0;
    createdDecorationTypes.length = 0;
    vi.spyOn(GitRepository, 'open').mockResolvedValue({
      id: 'repo-1',
      rootPath: '/repo',
      getBlame,
      getCommitBody,
    } as unknown as GitRepository);
  });

  afterEach(() => {
    provider?.dispose();
    provider = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.visibleTextEditors = [];
    hoverProviders.length = 0;
    workspace.textDocuments.length = 0;
  });

  it('decorates every blame line with the configured format', async () => {
    setMockConfigurationValue('gitGraph.blame.format', '${shortSha} • ${author}');
    const document = new MockTextDocument('/repo/src/a.ts', 'const a = 1;\nconst b = 2;');
    const editor = new MockTextEditor(document);
    window.visibleTextEditors = [editor];

    provider = new BlameDecorationProvider();

    await vi.waitFor(() => {
      expect(editor.appliedDecorations.size).toBe(1);
    });

    const decorationType = createdDecorationTypes[0]!;
    const decorations = editor.appliedDecorations.get(decorationType) as Array<{
      range: Range;
      renderOptions: { after: { contentText: string } };
    }>;

    expect(decorations).toHaveLength(2);
    expect(decorations[0]?.range.start.line).toBe(0);
    expect(decorations[1]?.range.start.line).toBe(1);
    expect(decorations[0]?.renderOptions.after.contentText).toContain('abcdef1 • Alice');
  });

  it('clears and reapplies decorations when toggled off and on', async () => {
    const document = new MockTextDocument('/repo/src/a.ts', 'const a = 1;\nconst b = 2;');
    const editor = new MockTextEditor(document);
    window.visibleTextEditors = [editor];

    provider = new BlameDecorationProvider();
    await vi.waitFor(() => expect(editor.appliedDecorations.size).toBe(1));

    await provider.setEnabled(false);
    const decorationType = createdDecorationTypes[0]!;
    expect(editor.appliedDecorations.get(decorationType)).toEqual([]);
    expect(provider.enabled).toBe(false);

    await provider.setEnabled(true);
    await vi.waitFor(() => {
      const decorations = editor.appliedDecorations.get(decorationType);
      expect(Array.isArray(decorations) ? decorations.length : 0).toBe(2);
    });
  });

  it('reacts to configuration changes without leaking decorations', async () => {
    const document = new MockTextDocument('/repo/src/a.ts', 'const a = 1;\nconst b = 2;');
    const editor = new MockTextEditor(document);
    window.visibleTextEditors = [editor];

    provider = new BlameDecorationProvider();
    await vi.waitFor(() => expect(editor.appliedDecorations.size).toBe(1));

    setMockConfigurationValue('gitGraph.blame.enabled', false);
    workspace._fireDidChangeConfiguration('gitGraph.blame.enabled');

    const decorationType = createdDecorationTypes[0]!;
    expect(editor.appliedDecorations.get(decorationType)).toEqual([]);
    expect(provider.enabled).toBe(false);
  });

  it('debounces document changes and refreshes blame', async () => {
    const document = new MockTextDocument('/repo/src/a.ts', 'const a = 1;\nconst b = 2;');
    const editor = new MockTextEditor(document);
    window.visibleTextEditors = [editor];

    provider = new BlameDecorationProvider();
    await vi.waitFor(() => expect(getBlame).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    workspace._fireDidChangeTextDocument(document);
    workspace._fireDidChangeTextDocument(document);
    expect(getBlame).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(getBlame).toHaveBeenCalledTimes(2);

    expect(getBlame).toHaveBeenLastCalledWith(
      'src/a.ts',
      undefined,
      expect.objectContaining({ noCache: true }),
    );
  });

  it('decorates only the visible viewport and updates on scroll', async () => {
    const content = Array.from({ length: 200 }, (_, index) => `line ${index}`).join('\n');
    const document = new MockTextDocument('/repo/src/large.ts', content);
    const editor = new MockTextEditor(document);
    editor.visibleRanges = [new Range(100, 0, 100, 10)];
    window.visibleTextEditors = [editor];

    const largeResult = buildBlameResult();
    largeResult.lines = Array.from({ length: 200 }, (_, index) => ({
      ...buildBlameResult().lines[0]!,
      lineNumber: index + 1,
      originalLineNumber: index + 1,
      content: `line ${index}`,
    }));
    getBlame.mockResolvedValue(largeResult);

    provider = new BlameDecorationProvider();
    await vi.waitFor(() => expect(editor.appliedDecorations.size).toBe(1));

    const decorationType = createdDecorationTypes[0]!;
    let decorations = editor.appliedDecorations.get(decorationType) as Array<{ range: Range }>;
    expect(decorations).toHaveLength(121);
    expect(decorations[0]?.range.start.line).toBe(40);
    expect(decorations.at(-1)?.range.start.line).toBe(160);

    editor.visibleRanges = [new Range(0, 0, 0, 10)];
    window._fireDidChangeTextEditorVisibleRanges(editor);

    decorations = editor.appliedDecorations.get(decorationType) as Array<{ range: Range }>;
    expect(decorations[0]?.range.start.line).toBe(0);
    expect(decorations.at(-1)?.range.start.line).toBe(60);
    expect(getBlame).toHaveBeenCalledTimes(1);
  });

  it('refreshes blame when repository metadata changes after a commit', async () => {
    const document = new MockTextDocument('/repo/src/a.ts', 'const a = 1;\nconst b = 2;');
    const editor = new MockTextEditor(document);
    window.visibleTextEditors = [editor];

    provider = new BlameDecorationProvider();
    await vi.waitFor(() => expect(getBlame).toHaveBeenCalledTimes(1));

    const watcher = activeWatchers.find((entry) => String(entry.pattern).includes('.git'));
    expect(watcher).toBeDefined();

    vi.useFakeTimers();
    watcher!.fireChange(new Uri('/repo/.git/index'));
    expect(getBlame).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(getBlame).toHaveBeenCalledTimes(2);
    expect(getBlame).toHaveBeenLastCalledWith(
      'src/a.ts',
      undefined,
      expect.objectContaining({ noCache: true }),
    );
  });

  it('provides a hover with commit metadata, body, and a reveal link', async () => {
    const document = new MockTextDocument('/repo/src/a.ts', 'const a = 1;\nconst b = 2;');
    const editor = new MockTextEditor(document);
    window.visibleTextEditors = [editor];

    provider = new BlameDecorationProvider();
    await vi.waitFor(() => expect(editor.appliedDecorations.size).toBe(1));

    const hoverProvider = hoverProviders.find(
      (entry) => (entry.selector as { scheme?: string }).scheme === 'file',
    );
    expect(hoverProvider).toBeDefined();

    const hover = await hoverProvider!.provider.provideHover(document, new Position(0, 0));

    expect(hover).toBeDefined();
    const markdown = hover!.contents[0]?.value ?? '';
    expect(markdown).toContain('feat: add blame');
    expect(markdown).toContain('alice@example.com');
    expect(markdown).toContain('Full commit body');
    expect(markdown).toContain('command:gitGraph.revealCommit?');
    expect(getCommitBody).toHaveBeenCalledTimes(1);

    await hoverProvider!.provider.provideHover(document, new Position(0, 0));
    expect(getCommitBody).toHaveBeenCalledTimes(1);
  });

  it('does not decorate or provide hover when disabled', async () => {
    setMockConfigurationValue('gitGraph.blame.enabled', false);
    const document = new MockTextDocument('/repo/src/a.ts', 'const a = 1;');
    const editor = new MockTextEditor(document);
    window.visibleTextEditors = [editor];

    provider = new BlameDecorationProvider();
    await Promise.resolve();

    expect(editor.appliedDecorations.size).toBe(0);
    const hoverProvider = hoverProviders.find(
      (entry) => (entry.selector as { scheme?: string }).scheme === 'file',
    );
    await expect(
      hoverProvider!.provider.provideHover(document, new Position(0, 0)),
    ).resolves.toBeUndefined();
  });
});
