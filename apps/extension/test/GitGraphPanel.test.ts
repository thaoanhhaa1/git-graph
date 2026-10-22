import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { GitGraphPanel } from '../src/webview/GitGraphPanel';
import { getWebviewHtml, getNonce } from '../src/webview/getWebviewHtml';
import { MockWebview } from './__mocks__/vscode';
import type { GitRepository } from '@git-graph/git-core';

describe('GitGraphPanel', () => {
  const extensionUri = vscode.Uri.file('/fake/extension/path');

  beforeEach(() => {
    vi.clearAllMocks();
    if (GitGraphPanel.currentPanel) {
      GitGraphPanel.currentPanel.dispose();
    }
  });

  afterEach(() => {
    if (GitGraphPanel.currentPanel) {
      GitGraphPanel.currentPanel.dispose();
    }
  });

  it('creates a new panel when none exists', () => {
    expect(GitGraphPanel.currentPanel).toBeUndefined();

    const panel = GitGraphPanel.createOrShow(extensionUri);
    expect(GitGraphPanel.currentPanel).toBe(panel);
    expect(panel.panel.title).toBe('Git Graph');
    expect(panel.panel.viewType).toBe(GitGraphPanel.viewType);
    expect(panel.panel.iconPath).toBeDefined();
  });

  it('reveals existing panel and does not create duplicate when called again', () => {
    const first = GitGraphPanel.createOrShow(extensionUri);
    const revealSpy = vi.spyOn(first.panel, 'reveal');

    const second = GitGraphPanel.createOrShow(extensionUri);
    expect(second).toBe(first);
    expect(revealSpy).toHaveBeenCalledTimes(1);
    expect(GitGraphPanel.currentPanel).toBe(first);
  });

  it('disposes cleanly and resets currentPanel on panel close', () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    expect(GitGraphPanel.currentPanel).toBe(panel);

    panel.dispose();
    expect(GitGraphPanel.currentPanel).toBeUndefined();
    expect(panel.disposablesCount).toBe(0);
  });

  it('handles user-triggered close event via onDidDispose', () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    expect(GitGraphPanel.currentPanel).toBe(panel);

    // Simulate VS Code closing the webview tab
    panel.panel.dispose();
    expect(GitGraphPanel.currentPanel).toBeUndefined();
    expect(panel.disposablesCount).toBe(0);
  });

  it('revives panel without duplicating listeners or panels', () => {
    const mockPanel = vscode.window.createWebviewPanel(
      GitGraphPanel.viewType,
      'Git Graph',
      vscode.ViewColumn.One,
    );

    const revived = GitGraphPanel.revive(mockPanel as unknown as vscode.WebviewPanel, extensionUri);
    expect(GitGraphPanel.currentPanel).toBe(revived);
    expect(revived.panel).toBe(mockPanel);

    // Reviving another one replaces the currentPanel cleanly
    const mockPanel2 = vscode.window.createWebviewPanel(
      GitGraphPanel.viewType,
      'Git Graph',
      vscode.ViewColumn.One,
    );
    const revived2 = GitGraphPanel.revive(
      mockPanel2 as unknown as vscode.WebviewPanel,
      extensionUri,
    );
    expect(GitGraphPanel.currentPanel).toBe(revived2);
    expect(revived2.disposablesCount).toBeGreaterThan(0);
  });

  it('specifies minimal localResourceRoots', () => {
    const roots = GitGraphPanel.getLocalResourceRoots(extensionUri);
    expect(roots.length).toBe(3);
    const paths = roots.map((r) => r.fsPath);
    expect(paths.some((p) => p.includes('dist/webview-ui'))).toBe(true);
    expect(paths.some((p) => p.includes('media'))).toBe(true);
  });

  it('responds with app.bootstrap when webview posts app.ready', () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'ready-1',
      type: 'app.ready',
      payload: { timestamp: Date.now() },
    });

    expect(postSpy).toHaveBeenCalledTimes(1);
    const bootstrapCall = postSpy.mock.calls[0]?.[0] as {
      type: string;
      protocolVersion: number;
      payload: {
        protocolVersion: number;
        repositories: Array<{ id: string; name: string }>;
        activeRepositoryId?: string;
        theme?: string;
      };
    };

    expect(bootstrapCall).toBeDefined();
    expect(bootstrapCall.type).toBe('app.bootstrap');
    expect(bootstrapCall.protocolVersion).toBe(1);
    expect(bootstrapCall.payload.repositories.length).toBeGreaterThanOrEqual(1);
    expect(bootstrapCall.payload.activeRepositoryId).toBeDefined();
  });

  it('queues reveal requests until the webview is ready', () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    panel.revealCommit('abcdef1234567890abcdef1234567890abcdef12', 'repo-1');
    expect(postSpy).not.toHaveBeenCalled();

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'ready-1',
      type: 'app.ready',
      payload: { timestamp: Date.now() },
    });

    const types = postSpy.mock.calls.map((call) => (call[0] as { type: string }).type);
    expect(types).toContain('app.bootstrap');
    expect(types).toContain('graph.reveal.commit');
  });

  it('posts reveal requests immediately once the webview is ready', () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'ready-1',
      type: 'app.ready',
      payload: { timestamp: Date.now() },
    });

    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');
    panel.revealCommit('abcdef1234567890abcdef1234567890abcdef12');

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy.mock.calls[0]?.[0]).toMatchObject({
      type: 'graph.reveal.commit',
      payload: { sha: 'abcdef1234567890abcdef1234567890abcdef12' },
    });
  });

  it('maps workspace folders to repositories in app.bootstrap', () => {
    (
      vscode.workspace as {
        workspaceFolders: vscode.WorkspaceFolder[] | undefined;
      }
    ).workspaceFolders = [
      {
        uri: vscode.Uri.file('/workspace/test-repo'),
        name: 'test-repo',
        index: 0,
      },
    ];

    const panel = GitGraphPanel.createOrShow(extensionUri);
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    panel.sendBootstrap();

    expect(postSpy).toHaveBeenCalledTimes(1);
    const call = postSpy.mock.calls[0]?.[0] as {
      type: string;
      payload: { repositories: Array<{ id: string; name: string; path: string }> };
    };
    expect(call.payload.repositories[0]?.name).toBe('test-repo');
    expect(call.payload.repositories[0]?.path).toBe('/workspace/test-repo');

    (
      vscode.workspace as {
        workspaceFolders: vscode.WorkspaceFolder[] | undefined;
      }
    ).workspaceFolders = undefined;
  });

  it('safely ignores invalid or unknown messages, logs warning, and does not throw', () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockWebview = panel.panel.webview as unknown as MockWebview;

    expect(() => {
      mockWebview.fireMessage(null);
      mockWebview.fireMessage('string-message');
      mockWebview.fireMessage({ type: 'unknown.type' });
      mockWebview.fireMessage({
        protocolVersion: 1,
        id: 'm1',
        type: 'app.ready',
        payload: 'not-an-object',
      });
    }).not.toThrow();

    expect(postSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('responds to repositories.list.request with repositories.list.result', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');
    const mockWebview = panel.panel.webview as unknown as MockWebview;

    const testRepo = {
      id: 'repo-abc',
      name: 'test-project',
      rootPath: '/projects/test',
      gitDir: '/projects/test/.git',
      isBare: false,
      path: '/projects/test',
    };
    vi.spyOn(panel.repositoryManager, 'getRepositories').mockReturnValue([testRepo]);
    vi.spyOn(panel.repositoryManager, 'refresh').mockResolvedValue([testRepo]);

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'req-list-1',
      type: 'repositories.list.request',
      payload: { refresh: true },
    });

    // Wait microtask
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(postSpy).toHaveBeenCalled();
    const resultCall = postSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'repositories.list.result',
    )?.[0] as {
      type: string;
      requestId?: string;
      payload: { repositories: Array<{ id: string }> };
    };

    expect(resultCall).toBeDefined();
    expect(resultCall.requestId).toBe('req-list-1');
    expect(resultCall.payload.repositories[0]?.id).toBe('repo-abc');
  });

  it('handles repository.select by updating active repository in repositoryManager', () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const setActiveSpy = vi.spyOn(panel.repositoryManager, 'setActiveRepository');
    const mockWebview = panel.panel.webview as unknown as MockWebview;

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'select-1',
      type: 'repository.select',
      payload: { repositoryId: 'repo-target' },
    });

    expect(setActiveSpy).toHaveBeenCalledWith('repo-target');
  });

  it('handles commits.page.request and posts commits.page.result', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const mockGitRepo = {
      getCommits: vi.fn().mockResolvedValue({
        commits: [
          {
            sha: '1'.repeat(40),
            shortSha: '1111111',
            parents: [],
            author: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: 'Z' },
            committer: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: 'Z' },
            subject: 'Initial commit',
            refs: [],
          },
        ],
        hasMore: false,
      }),
    };

    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'commits-req-1',
      type: 'commits.page.request',
      payload: { repositoryId: 'repo-1', limit: 25 },
    });

    // Wait a tick for async handler
    await new Promise((r) => setTimeout(r, 10));

    expect(mockGitRepo.getCommits).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'commits.page.result',
        payload: expect.objectContaining({
          repositoryId: 'repo-1',
          page: expect.objectContaining({ hasMore: false }),
        }),
      }),
    );
  });

  it('handles commit.details.request and posts commit.details.result', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const fullCommit = {
      sha: '2'.repeat(40),
      shortSha: '2222222',
      parents: [],
      author: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: 'Z' },
      committer: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: 'Z' },
      subject: 'Commit details test',
      body: 'Detailed multiline body',
      refs: [],
    };

    const mockGitRepo = {
      getCommitDetails: vi.fn().mockResolvedValue(fullCommit),
    };

    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'details-req-1',
      type: 'commit.details.request',
      payload: { repositoryId: 'repo-1', sha: '2'.repeat(40) },
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(mockGitRepo.getCommitDetails).toHaveBeenCalledWith('2'.repeat(40));
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'commit.details.result',
        payload: expect.objectContaining({
          repositoryId: 'repo-1',
          commit: fullCommit,
        }),
      }),
    );
  });

  it('posts graph.invalidated to webview when coordinator invalidates', () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    panel.refreshCoordinator.invalidate('repo-invalidated', 'fs-change');

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'graph.invalidated',
        payload: { repositoryId: 'repo-invalidated' },
      }),
    );
  });

  it('handles graph.refresh.request by requesting coordinator refresh and posting graph.invalidated', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');
    const mockWebview = panel.panel.webview as unknown as MockWebview;

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'refresh-1',
      type: 'graph.refresh.request',
      payload: { repositoryId: 'repo-refreshed' },
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'graph.invalidated',
        payload: { repositoryId: 'repo-refreshed' },
      }),
    );
  });

  it('discards commits.page.result if repository was invalidated while query was executing', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const slowCommits = async () => {
      await new Promise((r) => setTimeout(r, 30));
      // Trigger invalidation while query is still running
      panel.refreshCoordinator.invalidate('repo-1', 'fs-change');
      await new Promise((r) => setTimeout(r, 30));
      return { commits: [], hasMore: false };
    };

    const mockGitRepo = {
      getCommits: vi.fn().mockImplementation(slowCommits),
    };

    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'stale-commits-req',
      type: 'commits.page.request',
      payload: { repositoryId: 'repo-1', limit: 25 },
    });

    // Wait until slowCommits finishes
    await new Promise((r) => setTimeout(r, 100));

    // Verify commits.page.result was suppressed because it became stale
    const pageResultCall = postSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'commits.page.result',
    );
    expect(pageResultCall).toBeUndefined();
  });

  it('handles commit.diff.request and posts commit.diff.result', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const mockGitRepo = {
      getDiff: vi.fn().mockResolvedValue({
        diff: 'diff --git a/file.ts b/file.ts\n+added',
        isTruncated: false,
        isBinary: false,
      }),
    };

    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'diff-req-1',
      type: 'commit.diff.request',
      payload: { repositoryId: 'repo-1', sha: 'sha-abc', filePath: 'file.ts' },
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(mockGitRepo.getDiff).toHaveBeenCalledWith({
      sha: 'sha-abc',
      parentSha: undefined,
      filePath: 'file.ts',
      maxBytes: undefined,
    });

    const diffResultCall = postSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'commit.diff.result',
    );
    expect(diffResultCall).toBeDefined();
    const payload = (diffResultCall?.[0] as { payload: { diff: string; filePath: string } })
      .payload;
    expect(payload.diff).toContain('+added');
    expect(payload.filePath).toBe('file.ts');
  });

  it('handles diff.open.request by invoking vscode.commands.executeCommand with vscode.diff', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;

    const mockGitRepo = {
      getFileContent: vi.fn().mockResolvedValue('file content'),
    };

    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );

    const execCommandSpy = vi.spyOn(vscode.commands, 'executeCommand');

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'diff-open-req-1',
      type: 'diff.open.request',
      payload: {
        repositoryId: 'repo-1',
        sha: 'sha-child',
        parentSha: 'sha-parent',
        filePath: 'src/main.ts',
      },
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(execCommandSpy).toHaveBeenCalledWith(
      'vscode.diff',
      expect.anything(),
      expect.anything(),
      expect.stringContaining('src/main.ts'),
    );
  });

  it('handles file.openRevision.request by invoking vscode.window.showTextDocument', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;

    const mockGitRepo = {
      rootPath: '/repo/root',
      getFileContent: vi.fn().mockResolvedValue('file content at sha'),
    };

    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );

    const showTextDocumentSpy = vi.spyOn(vscode.window, 'showTextDocument');

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'file-open-req-1',
      type: 'file.openRevision.request',
      payload: {
        repositoryId: 'repo-1',
        sha: 'sha-commit-1',
        filePath: 'src/app.ts',
      },
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(showTextDocumentSpy).toHaveBeenCalled();
  });

  it('handles search.request and posts search.result', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;

    const mockCommits = [
      {
        sha: 'abc1234567890',
        shortSha: 'abc1234',
        parents: [],
        author: { name: 'Dev', email: 'dev@test.com', timestamp: 1000, timezone: '+0000' },
        committer: { name: 'Dev', email: 'dev@test.com', timestamp: 1000, timezone: '+0000' },
        subject: 'feat: add search filter',
        refs: [],
      },
    ];

    const mockGitRepo = {
      searchCommits: vi.fn().mockResolvedValue(mockCommits),
    };

    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );

    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'search-req-1',
      type: 'search.request',
      payload: { repositoryId: 'repo-1', query: 'search filter', searchType: 'subject' },
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(mockGitRepo.searchCommits).toHaveBeenCalledWith('search filter', {
      searchType: 'subject',
      limit: 50,
    });

    const searchResultCall = postSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'search.result',
    );
    expect(searchResultCall).toBeDefined();
    const payload = (
      searchResultCall?.[0] as { payload: { query: string; commits: typeof mockCommits } }
    ).payload;
    expect(payload.query).toBe('search filter');
    expect(payload.commits).toHaveLength(1);
    expect(payload.commits[0]?.sha).toBe('abc1234567890');
  });

  it('exposes gitOperationService and forwards progress/result events to webview', () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    expect(panel.gitOperationService).toBeDefined();

    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    // Emit progress on operation service
    panel.gitOperationService['_onDidProgress'].fire({
      requestId: 'op-progress-test',
      progress: 0.5,
      message: 'Processing...',
    });

    expect(postSpy).toHaveBeenCalled();
    const progressCall = postSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'operation.progress',
    );
    expect(progressCall).toBeDefined();
    expect(
      (progressCall?.[0] as { payload: { progress: number; requestId: string } }).payload,
    ).toEqual({
      requestId: 'op-progress-test',
      progress: 0.5,
      message: 'Processing...',
    });

    // Emit result on operation service
    panel.gitOperationService['_onDidResult'].fire({
      requestId: 'op-progress-test',
      success: true,
      data: { result: 'ok' },
    });

    const resultCall = postSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'operation.result',
    );
    expect(resultCall).toBeDefined();
    expect(
      (resultCall?.[0] as { payload: { success: boolean; requestId: string } }).payload.success,
    ).toBe(true);
  });

  it('routes operation.fetch.request to gitOperationService.fetch', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const fetchSpy = vi
      .spyOn(panel.gitOperationService, 'fetch')
      .mockResolvedValue({ operationId: 'fetch-test-1', repositoryId: 'repo-1', success: true });

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'fetch-test-1',
      type: 'operation.fetch.request',
      payload: { repositoryId: 'repo-1', remote: 'origin', prune: true },
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(fetchSpy).toHaveBeenCalledWith({
      operationId: 'fetch-test-1',
      repositoryId: 'repo-1',
      remote: 'origin',
      prune: true,
    });
  });

  it('handles operation.cancel.request by cancelling operation in gitOperationService', () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const cancelSpy = vi.spyOn(panel.gitOperationService, 'cancelOperation').mockReturnValue(true);

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'msg-cancel-1',
      type: 'operation.cancel.request',
      payload: { requestId: 'op-cancel-123' },
    });

    expect(cancelSpy).toHaveBeenCalledWith('op-cancel-123');
  });

  it('routes local branch checkout requests to gitOperationService', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const checkoutSpy = vi.spyOn(panel.gitOperationService, 'checkout').mockResolvedValue({
      operationId: 'checkout-local-1',
      repositoryId: 'repo-1',
      success: true,
    });

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'checkout-local-1',
      type: 'operation.checkout.request',
      payload: {
        repositoryId: 'repo-1',
        target: 'refs/heads/feature/safe',
        targetType: 'localBranch',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(checkoutSpy).toHaveBeenCalledWith({
      operationId: 'checkout-local-1',
      repositoryId: 'repo-1',
      target: 'refs/heads/feature/safe',
      targetType: 'localBranch',
    });
  });

  it('requires modal confirmation before detached commit checkout', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const checkoutSpy = vi.spyOn(panel.gitOperationService, 'checkout').mockResolvedValue({
      operationId: 'checkout-commit-1',
      repositoryId: 'repo-1',
      success: true,
    });
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Checkout Detached' as never);

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'checkout-commit-1',
      type: 'operation.checkout.request',
      payload: {
        repositoryId: 'repo-1',
        target: 'abcdef1234567',
        targetType: 'commit',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('will detach HEAD'),
      { modal: true },
      'Checkout Detached',
    );
    expect(checkoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'checkout-commit-1',
        targetType: 'commit',
        confirmedDetachedHead: true,
      }),
    );
  });

  it('prompts for the local branch name before remote tracking checkout', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const checkoutSpy = vi.spyOn(panel.gitOperationService, 'checkout').mockResolvedValue({
      operationId: 'checkout-remote-1',
      repositoryId: 'repo-1',
      success: true,
    });
    vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('feature/safe');

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'checkout-remote-1',
      type: 'operation.checkout.request',
      payload: {
        repositoryId: 'repo-1',
        target: 'refs/remotes/origin/feature/safe',
        targetType: 'remoteBranch',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vscode.window.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 'feature/safe',
      }),
    );
    expect(checkoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'checkout-remote-1',
        localBranchName: 'feature/safe',
        confirmedRemoteTracking: true,
      }),
    );
  });

  it('bypasses confirmation prompts when noConfirm is true on checkout request', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const checkoutSpy = vi.spyOn(panel.gitOperationService, 'checkout').mockResolvedValue({
      operationId: 'checkout-noconfirm-1',
      repositoryId: 'repo-1',
      success: true,
    });
    const warningSpy = vi.spyOn(vscode.window, 'showWarningMessage');
    const inputSpy = vi.spyOn(vscode.window, 'showInputBox');

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'checkout-noconfirm-1',
      type: 'operation.checkout.request',
      payload: {
        repositoryId: 'repo-1',
        target: 'v1.0.0',
        targetType: 'tag',
        noConfirm: true,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warningSpy).not.toHaveBeenCalled();
    expect(inputSpy).not.toHaveBeenCalled();
    expect(checkoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'checkout-noconfirm-1',
        target: 'v1.0.0',
        targetType: 'tag',
        confirmedDetachedHead: true,
      }),
    );
  });

  it('prompts for a branch name and creates then checks out from the requested start point', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const createBranchSpy = vi.spyOn(panel.gitOperationService, 'createBranch').mockResolvedValue({
      operationId: 'branch-create-1',
      repositoryId: 'repo-1',
      success: true,
    });
    vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('feature/safe');
    vi.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(
      'Create and Checkout' as never,
    );

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'branch-create-1',
      type: 'operation.branch.create.request',
      payload: {
        repositoryId: 'repo-1',
        startPoint: 'abcdef1234567',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vscode.window.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Create Branch',
        prompt: expect.stringContaining("'abcdef1234567'"),
      }),
    );
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("Create branch 'feature/safe'"),
      { modal: true },
      'Create and Checkout',
      'Create Only',
    );
    expect(createBranchSpy).toHaveBeenCalledWith({
      operationId: 'branch-create-1',
      repositoryId: 'repo-1',
      name: 'feature/safe',
      startPoint: 'abcdef1234567',
      checkout: true,
    });
  });

  it('supports creating a branch without checkout when intent is explicit', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const createBranchSpy = vi.spyOn(panel.gitOperationService, 'createBranch').mockResolvedValue({
      operationId: 'branch-create-only-1',
      repositoryId: 'repo-1',
      success: true,
    });
    const inputSpy = vi.spyOn(vscode.window, 'showInputBox');
    const actionSpy = vi.spyOn(vscode.window, 'showInformationMessage');

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'branch-create-only-1',
      type: 'operation.branch.create.request',
      payload: {
        repositoryId: 'repo-1',
        name: 'feature/create-only',
        startPoint: 'HEAD',
        checkout: false,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(inputSpy).not.toHaveBeenCalled();
    expect(actionSpy).not.toHaveBeenCalled();
    expect(createBranchSpy).toHaveBeenCalledWith({
      operationId: 'branch-create-only-1',
      repositoryId: 'repo-1',
      name: 'feature/create-only',
      startPoint: 'HEAD',
      checkout: false,
    });
  });

  it('prompts for a tag name and creates a lightweight tag at the requested commit', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const createTagSpy = vi.spyOn(panel.gitOperationService, 'createTag').mockResolvedValue({
      operationId: 'tag-create-1',
      repositoryId: 'repo-1',
      success: true,
    });
    vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('v1.0.0');

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'tag-create-1',
      type: 'operation.tag.create.request',
      payload: {
        repositoryId: 'repo-1',
        target: 'abcdef1234567',
        tagType: 'lightweight',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vscode.window.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Create Tag',
        prompt: expect.stringContaining("'abcdef1234567'"),
      }),
    );
    expect(createTagSpy).toHaveBeenCalledWith({
      operationId: 'tag-create-1',
      repositoryId: 'repo-1',
      name: 'v1.0.0',
      target: 'abcdef1234567',
      tagType: 'lightweight',
      message: undefined,
    });
  });

  it('creates annotated tags with push options without prompting for a name', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const createTagSpy = vi.spyOn(panel.gitOperationService, 'createTag').mockResolvedValue({
      operationId: 'tag-create-2',
      repositoryId: 'repo-1',
      success: true,
    });
    const inputSpy = vi.spyOn(vscode.window, 'showInputBox');

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'tag-create-2',
      type: 'operation.tag.create.request',
      payload: {
        repositoryId: 'repo-1',
        name: 'v2.0.0',
        target: 'abcdef1234567',
        tagType: 'annotated',
        message: 'Release 2.0.0',
        pushToRemote: true,
        remote: 'upstream',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(inputSpy).not.toHaveBeenCalled();
    expect(createTagSpy).toHaveBeenCalledWith({
      operationId: 'tag-create-2',
      repositoryId: 'repo-1',
      name: 'v2.0.0',
      target: 'abcdef1234567',
      tagType: 'annotated',
      message: 'Release 2.0.0',
      pushToRemote: true,
      remote: 'upstream',
    });
  });

  it('routes delete tag requests to the operation service', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const deleteTagSpy = vi.spyOn(panel.gitOperationService, 'deleteTag').mockResolvedValue({
      operationId: 'tag-delete-1',
      repositoryId: 'repo-1',
      success: true,
    });

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'tag-delete-1',
      type: 'operation.tag.delete.request',
      payload: {
        repositoryId: 'repo-1',
        tagName: 'v1.0.0',
        deleteOnRemote: true,
        remote: 'origin',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteTagSpy).toHaveBeenCalledWith({
      operationId: 'tag-delete-1',
      repositoryId: 'repo-1',
      tagName: 'v1.0.0',
      deleteOnRemote: true,
      remote: 'origin',
    });
  });

  it('prompts for a remote when deleting a tag from remote and multiple remotes exist', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const deleteTagSpy = vi.spyOn(panel.gitOperationService, 'deleteTag').mockResolvedValue({
      operationId: 'tag-delete-2',
      repositoryId: 'repo-1',
      success: true,
    });
    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue({
      getRemotes: vi.fn().mockResolvedValue(['origin', 'upstream']),
    } as unknown as GitRepository);
    const quickPickSpy = vi
      .spyOn(vscode.window, 'showQuickPick')
      .mockResolvedValue('upstream' as never);

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'tag-delete-2',
      type: 'operation.tag.delete.request',
      payload: {
        repositoryId: 'repo-1',
        tagName: 'v1.0.0',
        deleteOnRemote: true,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(quickPickSpy).toHaveBeenCalledWith(
      ['origin', 'upstream'],
      expect.objectContaining({ title: 'Delete Tag on Remote' }),
    );
    expect(deleteTagSpy).toHaveBeenCalledWith({
      operationId: 'tag-delete-2',
      repositoryId: 'repo-1',
      tagName: 'v1.0.0',
      deleteOnRemote: true,
      remote: 'upstream',
    });
  });

  it('does not delete a tag when the remote quick pick is cancelled', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const deleteTagSpy = vi.spyOn(panel.gitOperationService, 'deleteTag').mockResolvedValue({
      operationId: 'tag-delete-3',
      repositoryId: 'repo-1',
      success: true,
    });
    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue({
      getRemotes: vi.fn().mockResolvedValue(['origin', 'upstream']),
    } as unknown as GitRepository);
    vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValue(undefined);

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'tag-delete-3',
      type: 'operation.tag.delete.request',
      payload: {
        repositoryId: 'repo-1',
        tagName: 'v1.0.0',
        deleteOnRemote: true,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteTagSpy).not.toHaveBeenCalled();
  });

  it('prompts for merge fast-forward policy and routes merge requests', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mergeSpy = vi.spyOn(panel.gitOperationService, 'merge').mockResolvedValue({
      operationId: 'merge-1',
      repositoryId: 'repo-1',
      success: true,
    });
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(
      'Create Merge Commit (--no-ff)' as never,
    );

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'merge-1',
      type: 'operation.merge.request',
      payload: {
        repositoryId: 'repo-1',
        target: 'abcdef1234567',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("Merge 'abcdef1234567'"),
      { modal: true },
      'Fast-forward When Possible',
      'Create Merge Commit (--no-ff)',
      'Fast-forward Only (--ff-only)',
    );
    expect(mergeSpy).toHaveBeenCalledWith({
      operationId: 'merge-1',
      repositoryId: 'repo-1',
      target: 'abcdef1234567',
      fastForwardMode: 'no-ff',
    });
  });

  it('prompts for squash merge and routes squash merge requests', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mergeSpy = vi.spyOn(panel.gitOperationService, 'merge').mockResolvedValue({
      operationId: 'merge-squash-1',
      repositoryId: 'repo-1',
      success: true,
    });
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Squash Merge' as never);

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'merge-squash-1',
      type: 'operation.merge.request',
      payload: {
        repositoryId: 'repo-1',
        target: 'abcdef1234567',
        squash: true,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("Squash merge 'abcdef1234567'"),
      { modal: true },
      'Squash Merge',
    );
    expect(mergeSpy).toHaveBeenCalledWith({
      operationId: 'merge-squash-1',
      repositoryId: 'repo-1',
      target: 'abcdef1234567',
      squash: true,
    });
  });

  it('skips the rebase confirmation prompt when noConfirm is set', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const rebaseSpy = vi.spyOn(panel.gitOperationService, 'rebase').mockResolvedValue({
      operationId: 'rebase-1',
      repositoryId: 'repo-1',
      success: true,
    });
    const warnSpy = vi.spyOn(vscode.window, 'showWarningMessage');

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'rebase-1',
      type: 'operation.rebase.request',
      payload: {
        repositoryId: 'repo-1',
        target: 'abcdef1234567',
        ignoreDate: true,
        noConfirm: true,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warnSpy).not.toHaveBeenCalled();
    expect(rebaseSpy).toHaveBeenCalledWith({
      operationId: 'rebase-1',
      repositoryId: 'repo-1',
      target: 'abcdef1234567',
      confirmedPublishedBranch: false,
      ignoreDate: true,
    });
  });

  it('resolves interactive rebase plans and posts the result', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const sha = 'a'.repeat(40);
    const entry = {
      action: 'pick' as const,
      sha,
      shortSha: 'aaaaaaa',
      subject: 'feat: initial',
      author: 'Ada',
      date: 1700000000,
    };
    const getRebasePlan = vi.fn().mockResolvedValue([entry]);
    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue({
      exec: vi.fn().mockResolvedValue({ stdout: `${sha}\n`, stderr: '', exitCode: 0 }),
      getRebasePlan,
    } as unknown as GitRepository);
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'plan-req-1',
      requestId: 'plan-req-1',
      type: 'rebase.interactive.plan.request',
      payload: { repositoryId: 'repo-1', onto: 'main~2' },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getRebasePlan).toHaveBeenCalledWith(sha);
    const planCall = postSpy.mock.calls.find(
      (call) => (call[0] as { type: string }).type === 'rebase.interactive.plan.result',
    );
    expect(planCall).toBeDefined();
    expect(
      (planCall?.[0] as { payload: { requestId: string; entries: unknown[]; error?: string } })
        .payload,
    ).toEqual({
      requestId: 'plan-req-1',
      repositoryId: 'repo-1',
      onto: sha,
      entries: [entry],
    });
  });

  it('reports interactive rebase plan failures without throwing', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue({
      exec: vi.fn().mockRejectedValue(new Error("'missing' does not resolve to a commit.")),
    } as unknown as GitRepository);
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'plan-req-2',
      requestId: 'plan-req-2',
      type: 'rebase.interactive.plan.request',
      payload: { repositoryId: 'repo-1', onto: 'missing' },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const planCall = postSpy.mock.calls.find(
      (call) => (call[0] as { type: string }).type === 'rebase.interactive.plan.result',
    );
    expect(
      (planCall?.[0] as { payload: { entries: unknown[]; error?: string } }).payload,
    ).toMatchObject({
      onto: 'missing',
      entries: [],
      error: "'missing' does not resolve to a commit.",
    });
  });

  it('routes interactive rebase start and action requests to GitOperationService', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const startSpy = vi
      .spyOn(panel.gitOperationService, 'interactiveRebase')
      .mockResolvedValue({ operationId: 'interactive-1', repositoryId: 'repo-1', success: true });
    const continueSpy = vi
      .spyOn(panel.gitOperationService, 'continueRebase')
      .mockResolvedValue({ operationId: 'continue-1', repositoryId: 'repo-1', success: true });
    const abortSpy = vi
      .spyOn(panel.gitOperationService, 'abortRebase')
      .mockResolvedValue({ operationId: 'abort-1', repositoryId: 'repo-1', success: true });
    const skipSpy = vi
      .spyOn(panel.gitOperationService, 'skipRebase')
      .mockResolvedValue({ operationId: 'skip-1', repositoryId: 'repo-1', success: true });
    const entry = {
      action: 'pick' as const,
      sha: 'a'.repeat(40),
      shortSha: 'aaaaaaa',
      subject: 'feat: initial',
      author: 'Ada',
      date: 1700000000,
    };

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'interactive-1',
      type: 'rebase.interactive.start.request',
      payload: {
        repositoryId: 'repo-1',
        onto: 'a'.repeat(40),
        plan: [entry],
        confirmedPublishedBranch: true,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(startSpy).toHaveBeenCalledWith({
      operationId: 'interactive-1',
      repositoryId: 'repo-1',
      onto: 'a'.repeat(40),
      plan: [entry],
      confirmedPublishedBranch: true,
    });

    for (const [type, id] of [
      ['rebase.interactive.continue', 'continue-1'],
      ['rebase.interactive.abort', 'abort-1'],
      ['rebase.interactive.skip', 'skip-1'],
    ] as const) {
      mockWebview.fireMessage({
        protocolVersion: 1,
        id,
        type,
        payload: { repositoryId: 'repo-1' },
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(continueSpy).toHaveBeenCalledWith({
      operationId: 'continue-1',
      repositoryId: 'repo-1',
    });
    expect(abortSpy).toHaveBeenCalledWith({ operationId: 'abort-1', repositoryId: 'repo-1' });
    expect(skipSpy).toHaveBeenCalledWith({ operationId: 'skip-1', repositoryId: 'repo-1' });
  });

  it('skips the cherry-pick confirmation prompt when noConfirm is set', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const cherryPickSpy = vi.spyOn(panel.gitOperationService, 'cherryPick').mockResolvedValue({
      operationId: 'cp-1',
      repositoryId: 'repo-1',
      success: true,
    });
    const warnSpy = vi.spyOn(vscode.window, 'showWarningMessage');

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'cp-1',
      type: 'operation.cherryPick.request',
      payload: {
        repositoryId: 'repo-1',
        commit: 'abcdef1234567',
        mainlineParent: 2,
        noCommit: true,
        noConfirm: true,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warnSpy).not.toHaveBeenCalled();
    expect(cherryPickSpy).toHaveBeenCalledWith({
      operationId: 'cp-1',
      repositoryId: 'repo-1',
      commit: 'abcdef1234567',
      mainlineParent: 2,
      noCommit: true,
    });
  });

  it('skips the revert confirmation prompt when noConfirm is set', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const revertSpy = vi.spyOn(panel.gitOperationService, 'revert').mockResolvedValue({
      operationId: 'revert-1',
      repositoryId: 'repo-1',
      success: true,
    });
    const warnSpy = vi.spyOn(vscode.window, 'showWarningMessage');

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'revert-1',
      type: 'operation.revert.request',
      payload: {
        repositoryId: 'repo-1',
        commit: 'abcdef1234567',
        mainlineParent: 1,
        noConfirm: true,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warnSpy).not.toHaveBeenCalled();
    expect(revertSpy).toHaveBeenCalledWith({
      operationId: 'revert-1',
      repositoryId: 'repo-1',
      commit: 'abcdef1234567',
      mainlineParent: 1,
    });
  });

  it('confirms cherry-pick requests when noConfirm is absent', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const cherryPickSpy = vi.spyOn(panel.gitOperationService, 'cherryPick').mockResolvedValue({
      operationId: 'cp-2',
      repositoryId: 'repo-1',
      success: true,
    });
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Cherry-pick' as never);

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'cp-2',
      type: 'operation.cherryPick.request',
      payload: {
        repositoryId: 'repo-1',
        commit: 'abcdef1234567',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("Cherry-pick commit 'abcdef1234567'"),
      { modal: true },
      'Cherry-pick',
    );
    expect(cherryPickSpy).toHaveBeenCalledWith({
      operationId: 'cp-2',
      repositoryId: 'repo-1',
      commit: 'abcdef1234567',
    });
  });

  it('does not start cherry-pick when the confirmation is dismissed', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const cherryPickSpy = vi.spyOn(panel.gitOperationService, 'cherryPick').mockResolvedValue({
      operationId: 'cp-3',
      repositoryId: 'repo-1',
      success: true,
    });
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'cp-3',
      type: 'operation.cherryPick.request',
      payload: {
        repositoryId: 'repo-1',
        commit: 'abcdef1234567',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cherryPickSpy).not.toHaveBeenCalled();
  });

  it('confirms merge abort requests before invoking abortMerge', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const abortMergeSpy = vi.spyOn(panel.gitOperationService, 'abortMerge').mockResolvedValue({
      operationId: 'merge-abort-1',
      repositoryId: 'repo-1',
      success: true,
    });
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Abort Merge' as never);

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'merge-abort-1',
      type: 'operation.merge.abort.request',
      payload: {
        repositoryId: 'repo-1',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Abort the in-progress merge'),
      { modal: true },
      'Abort Merge',
    );
    expect(abortMergeSpy).toHaveBeenCalledWith({
      operationId: 'merge-abort-1',
      repositoryId: 'repo-1',
    });
  });
});

describe('getWebviewHtml', () => {
  const extensionUri = vscode.Uri.file('/fake/extension/path');

  it('chunks commit page results when number of commits exceeds DEFAULT_CHUNK_SIZE', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const mockCommits = Array.from({ length: 150 }, (_, i) => ({
      sha: i.toString(16).padStart(40, '0'),
      shortSha: i.toString(16).padStart(7, '0'),
      parents: [],
      author: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: 'Z' },
      committer: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: 'Z' },
      subject: 'Commit ' + i,
      refs: [],
    }));

    const mockGitRepo = {
      getCommits: vi.fn().mockResolvedValue({
        commits: mockCommits,
        hasMore: true,
        cursor: '150',
      }),
    };

    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'commits-req-chunked',
      type: 'commits.page.request',
      payload: { repositoryId: 'repo-1', limit: 150 },
    });

    await new Promise((r) => setTimeout(r, 20));

    const chunkCalls = postSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'commits.page.result',
    );
    expect(chunkCalls).toHaveLength(2);

    const chunk0 = chunkCalls[0]![0] as {
      payload: {
        chunkIndex: number;
        totalChunks: number;
        isLastChunk: boolean;
        page: { commits: unknown[] };
      };
    };
    expect(chunk0.payload.chunkIndex).toBe(0);
    expect(chunk0.payload.totalChunks).toBe(2);
    expect(chunk0.payload.isLastChunk).toBe(false);
    expect(chunk0.payload.page.commits).toHaveLength(100);

    const chunk1 = chunkCalls[1]![0] as {
      payload: {
        chunkIndex: number;
        totalChunks: number;
        isLastChunk: boolean;
        page: { commits: unknown[] };
      };
    };
    expect(chunk1.payload.chunkIndex).toBe(1);
    expect(chunk1.payload.totalChunks).toBe(2);
    expect(chunk1.payload.isLastChunk).toBe(true);
    expect(chunk1.payload.page.commits).toHaveLength(50);
  });

  it('cancels previous in-flight commit query when new initial query or filter arrives', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    let firstSignal: AbortSignal | undefined;
    let resolveFirst: (v: unknown) => void;

    const mockGitRepo = {
      getCommits: vi.fn().mockImplementation((opts: { signal?: AbortSignal }) => {
        if (!firstSignal) {
          firstSignal = opts.signal;
          return new Promise((resolve) => {
            resolveFirst = resolve;
          });
        }
        return Promise.resolve({
          commits: [
            {
              sha: '2'.repeat(40),
              shortSha: '2222222',
              parents: [],
              author: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: 'Z' },
              committer: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: 'Z' },
              subject: 'Second query',
              refs: [],
            },
          ],
          hasMore: false,
        });
      }),
    };

    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );

    // Send first query
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'req-1',
      type: 'commits.page.request',
      payload: { repositoryId: 'repo-1' },
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(firstSignal).toBeDefined();
    expect(firstSignal?.aborted).toBe(false);

    // Send second query (filter switch) before first completes
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'req-2',
      type: 'commits.page.request',
      payload: { repositoryId: 'repo-1', search: 'new-filter' },
    });

    await new Promise((r) => setTimeout(r, 10));

    // First query signal should now be aborted
    expect(firstSignal?.aborted).toBe(true);

    // Resolve first query late (should be discarded)
    resolveFirst!({
      commits: [
        {
          sha: '1'.repeat(40),
          shortSha: '1111111',
          parents: [],
          author: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: 'Z' },
          committer: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: 'Z' },
          subject: 'First query',
          refs: [],
        },
      ],
      hasMore: false,
    });

    await new Promise((r) => setTimeout(r, 20));

    const resultMsgs = postSpy.mock.calls
      .map(
        (c) =>
          c[0] as { type: string; payload: { page?: { commits: Array<{ subject: string }> } } },
      )
      .filter((m) => m.type === 'commits.page.result');

    // Only second query result was posted
    expect(resultMsgs).toHaveLength(1);
    expect(resultMsgs[0]?.payload.page?.commits[0]?.subject).toBe('Second query');
  });

  it('handles consecutive initial commit queries without throwing abort errors', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const mockGitRepo = {
      getCommits: vi.fn().mockImplementation(async (opts: { signal?: AbortSignal }) => {
        if (opts.signal?.aborted) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          throw err;
        }
        await new Promise((r) => setTimeout(r, 15));
        if (opts.signal?.aborted) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          throw err;
        }
        return {
          commits: [
            {
              sha: '3'.repeat(40),
              shortSha: '3333333',
              parents: [],
              author: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: 'Z' },
              committer: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: 'Z' },
              subject: 'Clean query',
              refs: [],
            },
          ],
          hasMore: false,
        };
      }),
    };

    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );

    // Fire first query
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'req-fast-1',
      type: 'commits.page.request',
      payload: { repositoryId: 'repo-1' },
    });

    // Immediately fire second query (same queryKey, like refresh)
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'req-fast-2',
      type: 'commits.page.request',
      payload: { repositoryId: 'repo-1' },
    });

    await new Promise((r) => setTimeout(r, 150));

    // Verify error was NOT posted to webview
    const errorCalls = postSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'notification.error',
    );
    expect(errorCalls).toHaveLength(0);

    const resultCalls = postSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'commits.page.result',
    );
    expect(resultCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('serves staged and untracked diffs for uncommitted rows', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const mockGitRepo = {
      getWorktreeStatus: vi.fn().mockResolvedValue({
        isClean: false,
        staged: [],
        unstaged: [
          {
            path: 'new.ts',
            status: 'untracked',
            indexStatus: '?',
            worktreeStatus: '?',
            staged: false,
            unstaged: true,
          },
        ],
        hasConflicts: false,
        head: null,
      }),
      getWorktreeDiff: vi.fn().mockResolvedValue({
        diff: '+staged',
        isTruncated: false,
        isBinary: false,
      }),
    };
    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'diff-staged-1',
      type: 'commit.diff.request',
      payload: { repositoryId: 'repo-1', sha: '*', filePath: 'new.ts', staged: true },
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(mockGitRepo.getWorktreeDiff).toHaveBeenCalledWith({
      filePath: 'new.ts',
      staged: true,
      untracked: false,
    });
    const resultCall = postSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'commit.diff.result',
    );
    expect((resultCall?.[0] as { payload: { staged?: boolean } }).payload.staged).toBe(true);

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'diff-untracked-1',
      type: 'commit.diff.request',
      payload: { repositoryId: 'repo-1', sha: '*', filePath: 'new.ts' },
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(mockGitRepo.getWorktreeDiff).toHaveBeenLastCalledWith({
      filePath: 'new.ts',
      staged: false,
      untracked: true,
    });
  });

  it('opens uncommitted diffs against the index when staged is set', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;

    const mockGitRepo = {
      getFileContent: vi.fn().mockResolvedValue('head content'),
      getIndexFileContent: vi.fn().mockResolvedValue('index content'),
    };
    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );
    const execCommandSpy = vi.spyOn(vscode.commands, 'executeCommand');

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'open-staged-1',
      type: 'diff.open.request',
      payload: { repositoryId: 'repo-1', sha: '*', filePath: 'src/a.ts', staged: true },
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(execCommandSpy).toHaveBeenCalledWith(
      'vscode.diff',
      expect.objectContaining({ fsPath: expect.stringContaining('sha=HEAD') }),
      expect.objectContaining({ fsPath: expect.stringContaining('sha=INDEX') }),
      'src/a.ts (HEAD ↔ Index)',
    );
  });

  it('handles worktree.status.request and posts worktree.status.result', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const status = {
      isClean: false,
      staged: [],
      unstaged: [
        {
          path: 'src/a.ts',
          status: 'modified',
          indexStatus: ' ',
          worktreeStatus: 'M',
          staged: false,
          unstaged: true,
        },
      ],
      hasConflicts: false,
      head: null,
    };
    const mockGitRepo = { getWorktreeStatus: vi.fn().mockResolvedValue(status) };
    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'worktree-status-1',
      type: 'worktree.status.request',
      payload: { repositoryId: 'repo-1' },
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(mockGitRepo.getWorktreeStatus).toHaveBeenCalledTimes(1);
    const resultCall = postSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'worktree.status.result',
    );
    expect(resultCall).toBeDefined();
    const payload = (resultCall?.[0] as { payload: { status: typeof status } }).payload;
    expect(payload.status.unstaged).toHaveLength(1);
  });

  it('handles worktree.list.request and posts worktree.list.result', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const worktrees = [
      {
        path: '/repos/main',
        branch: 'main',
        headSha: 'a'.repeat(40),
        isCurrent: true,
      },
      {
        path: '/repos/feature',
        branch: 'feature',
        headSha: 'b'.repeat(40),
      },
    ];
    const mockGitRepo = { listWorktrees: vi.fn().mockResolvedValue(worktrees) };
    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'worktree-list-1',
      type: 'worktree.list.request',
      payload: { repositoryId: 'repo-1' },
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(mockGitRepo.listWorktrees).toHaveBeenCalledTimes(1);
    const resultCall = postSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'worktree.list.result',
    );
    expect(resultCall).toBeDefined();
    const payload = (
      resultCall?.[0] as { payload: { worktrees: typeof worktrees; currentPath?: string } }
    ).payload;
    expect(payload.worktrees).toHaveLength(2);
    expect(payload.currentPath).toBe('/repos/main');
  });

  it('routes worktree add and remove requests to GitOperationService', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const addSpy = vi
      .spyOn(panel.gitOperationService, 'addGitWorktree')
      .mockResolvedValue({ operationId: 'worktree-add-1', repositoryId: 'repo-1', success: true });
    const removeSpy = vi.spyOn(panel.gitOperationService, 'removeGitWorktree').mockResolvedValue({
      operationId: 'worktree-remove-1',
      repositoryId: 'repo-1',
      success: true,
    });

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'worktree-add-1',
      type: 'worktree.add.request',
      payload: { repositoryId: 'repo-1', path: '/repos/linked', newBranch: 'feature' },
    });
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'worktree-remove-1',
      type: 'worktree.remove.request',
      payload: { repositoryId: 'repo-1', path: '/repos/linked', force: true },
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(addSpy).toHaveBeenCalledWith({
      operationId: 'worktree-add-1',
      repositoryId: 'repo-1',
      path: '/repos/linked',
      branch: undefined,
      newBranch: 'feature',
    });
    expect(removeSpy).toHaveBeenCalledWith({
      operationId: 'worktree-remove-1',
      repositoryId: 'repo-1',
      path: '/repos/linked',
      force: true,
    });
  });

  it('handles submodule.list.request and posts submodule.list.result', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const submodules = [
      {
        name: 'libs/core',
        path: 'libs/core',
        state: 'clean',
        recordedSha: 'c'.repeat(40),
        headSha: 'c'.repeat(40),
      },
    ];
    const mockGitRepo = { listSubmodules: vi.fn().mockResolvedValue(submodules) };
    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'submodule-list-1',
      type: 'submodule.list.request',
      payload: { repositoryId: 'repo-1' },
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(mockGitRepo.listSubmodules).toHaveBeenCalledTimes(1);
    const resultCall = postSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'submodule.list.result',
    );
    expect(resultCall).toBeDefined();
    expect(
      (resultCall?.[0] as { payload: { submodules: typeof submodules } }).payload.submodules,
    ).toHaveLength(1);
  });

  it('opens a submodule repository and posts repository.changed', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const root = '/tmp/parent-repo';
    const mockGitRepo = { rootPath: root };
    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );
    const openSpy = vi.spyOn(panel.repositoryManager, 'openRepository').mockResolvedValue({
      id: 'submodule-repo',
      rootPath: `${root}/libs/core`,
      name: 'core',
      gitDir: `${root}/libs/core/.git`,
      isBare: false,
    });

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'submodule-open-1',
      type: 'submodule.open.request',
      payload: { repositoryId: 'repo-1', path: 'libs/core' },
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(openSpy).toHaveBeenCalledWith(`${root}/libs/core`);
    const changedCall = postSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'repository.changed',
    );
    expect(changedCall).toBeDefined();
    expect(
      (changedCall?.[0] as { payload: { activeRepositoryId: string } }).payload.activeRepositoryId,
    ).toBe('submodule-repo');
  });

  it('handles stash.list.request and posts stash.list.result', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const stashes = [{ index: 0, ref: 'stash@{0}', sha: 'a'.repeat(40), message: 'WIP on main' }];
    const mockGitRepo = { listStashes: vi.fn().mockResolvedValue(stashes) };
    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue(
      mockGitRepo as unknown as GitRepository,
    );

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'stash-list-1',
      type: 'stash.list.request',
      payload: { repositoryId: 'repo-1' },
    });

    await new Promise((r) => setTimeout(r, 10));

    const resultCall = postSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'stash.list.result',
    );
    expect(resultCall).toBeDefined();
    expect(
      (resultCall?.[0] as { payload: { stashes: typeof stashes } }).payload.stashes,
    ).toHaveLength(1);
  });

  it('discards worktree changes only after modal confirmation unless noConfirm is set', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    const discardSpy = vi.spyOn(panel.gitOperationService, 'discardWorktree').mockResolvedValue({
      success: true,
      operationId: 'op',
      repositoryId: 'repo-1',
      durationMs: 1,
      data: { paths: ['src/a.ts'], all: false },
    });
    const warnSpy = vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'discard-cancelled',
      type: 'worktree.discard.request',
      payload: { repositoryId: 'repo-1', paths: ['src/a.ts'] },
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Discard 1 file?'),
      expect.objectContaining({ modal: true }),
      'Discard Changes',
    );
    expect(discardSpy).not.toHaveBeenCalled();

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'discard-confirmed',
      type: 'worktree.discard.request',
      payload: { repositoryId: 'repo-1', paths: ['src/a.ts'], noConfirm: true },
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(discardSpy).toHaveBeenCalledWith({
      operationId: 'discard-confirmed',
      repositoryId: 'repo-1',
      paths: ['src/a.ts'],
      all: undefined,
      untracked: undefined,
    });
  });

  it('drops a stash only after modal confirmation', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    const dropSpy = vi.spyOn(panel.gitOperationService, 'dropStash').mockResolvedValue({
      success: true,
      operationId: 'op',
      repositoryId: 'repo-1',
      durationMs: 1,
      data: { action: 'drop', index: 0, ref: 'stash@{0}' },
    });
    const warnSpy = vi
      .spyOn(vscode.window, 'showWarningMessage')
      .mockResolvedValue('Drop Stash' as never);

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'stash-drop-1',
      type: 'stash.drop.request',
      payload: { repositoryId: 'repo-1', index: 0 },
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(warnSpy).toHaveBeenCalledWith(
      'Drop stash@{0}? This permanently removes the stash entry.',
      expect.objectContaining({ modal: true }),
      'Drop Stash',
    );
    expect(dropSpy).toHaveBeenCalledWith({
      operationId: 'stash-drop-1',
      repositoryId: 'repo-1',
      index: 0,
    });
  });

  it('generates 32-character base64 nonces that differ each invocation', () => {
    const n1 = getNonce();
    const n2 = getNonce();
    expect(n1).toBeDefined();
    expect(n2).toBeDefined();
    expect(n1).not.toBe(n2);
    expect(n1.length).toBeGreaterThanOrEqual(20);
  });

  it('includes strict CSP with nonce and avoids unsafe-eval', () => {
    const mockWebview = new MockWebview() as unknown as vscode.Webview;
    const html = getWebviewHtml(mockWebview, extensionUri);

    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-");
    expect(html).not.toContain("'unsafe-eval'");
    expect(html).toContain('img-src');
    expect(html).toContain('style-src');
  });

  it('renders skeleton loading UI inside #root for instant feedback before bootstrap', () => {
    const mockWebview = new MockWebview() as unknown as vscode.Webview;
    const html = getWebviewHtml(mockWebview, extensionUri);

    expect(html).toContain('<div id="root">');
    expect(html).toContain('skeleton-container');
    expect(html).toContain('skeleton-toolbar');
    expect(html).toContain('skeleton-row');
    expect(html).toContain('var(--vscode-editor-background');
  });

  it('sends filter.path.set message when setPathFilter is called', () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    panel.setPathFilter('src/components/ui/Button.tsx', 'repo-1');

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'filter.path.set',
        payload: {
          path: 'src/components/ui/Button.tsx',
          repositoryId: 'repo-1',
        },
      }),
    );
  });

  it('handles view.config.update and persists commitOrdering setting', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const mockWebview = panel.panel.webview as unknown as MockWebview;

    const updateSpy = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn(),
      update: updateSpy,
    } as unknown as vscode.WorkspaceConfiguration);

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'msg-config-1',
      type: 'view.config.update',
      payload: {
        commitOrdering: 'topo-order',
        pageSize: 250,
      },
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(updateSpy).toHaveBeenCalledWith(
      'commitOrdering',
      'topo-order',
      vscode.ConfigurationTarget.Global,
    );
    expect(updateSpy).toHaveBeenCalledWith('pageSize', 250, vscode.ConfigurationTarget.Global);
  });

  it('posts view.config.changed when gitGraph settings change after webview is ready', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);

    const getMock = vi.fn((key: string, defaultValue?: unknown) => {
      if (key === 'showMinimap') return false;
      if (key === 'compactMode') return true;
      return defaultValue;
    });
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: getMock,
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as vscode.WorkspaceConfiguration);

    (panel as unknown as { _webviewReady: boolean })._webviewReady = true;

    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');
    const workspaceMock = vscode.workspace as unknown as {
      _fireDidChangeConfiguration: (section: string) => void;
    };
    workspaceMock._fireDidChangeConfiguration('gitGraph');
    await new Promise((resolve) => setTimeout(resolve, 10));

    const changed = postSpy.mock.calls
      .map((call) => call[0] as { type?: string; payload?: Record<string, unknown> })
      .find((message) => message.type === 'view.config.changed');
    expect(changed).toBeDefined();
    expect(changed?.payload).toMatchObject({ showMinimap: false, compactMode: true });

    panel.dispose();
  });

  it('queues showDialog until the webview is ready and then forwards it', () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');
    const mockWebview = panel.panel.webview as unknown as MockWebview;

    panel.showDialog('remotes');

    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'ready-dialog',
      type: 'app.ready',
      payload: { timestamp: Date.now() },
    });

    const dialogCall = postSpy.mock.calls.find(
      (call) => (call[0] as { type?: string }).type === 'ui.dialog.open',
    );
    expect(dialogCall).toBeDefined();
    expect((dialogCall?.[0] as { payload: { dialog: string } }).payload.dialog).toBe('remotes');

    panel.showDialog('push');
    const forwarded = postSpy.mock.calls.filter(
      (call) => (call[0] as { type?: string }).type === 'ui.dialog.open',
    );
    expect(forwarded).toHaveLength(2);
  });

  it('routes operation.pull.request to gitOperationService.pull', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const pullSpy = vi
      .spyOn(panel.gitOperationService, 'pull')
      .mockResolvedValue({ operationId: 'pull-1', repositoryId: 'repo-1', success: true });

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'pull-1',
      type: 'operation.pull.request',
      payload: {
        repositoryId: 'repo-1',
        remote: 'origin',
        branch: 'main',
        strategy: 'rebase',
        autostash: true,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pullSpy).toHaveBeenCalledWith({
      operationId: 'pull-1',
      repositoryId: 'repo-1',
      remote: 'origin',
      branch: 'main',
      strategy: 'rebase',
      autostash: true,
    });
  });

  it('responds to remote.list.request with parsed remote details', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const remotes = [
      {
        name: 'origin',
        fetchUrl: 'https://example.com/repo.git',
        pushUrl: 'git@example.com:repo.git',
      },
    ];
    const getRemoteDetails = vi.fn().mockResolvedValue(remotes);
    vi.spyOn(panel.repositoryManager, 'getRepository').mockReturnValue({
      getRemoteDetails,
    } as unknown as GitRepository);

    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'remotes-1',
      type: 'remote.list.request',
      payload: { repositoryId: 'repo-1' },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getRemoteDetails).toHaveBeenCalledTimes(1);
    const result = postSpy.mock.calls.find(
      (call) => (call[0] as { type?: string }).type === 'remote.list.result',
    );
    expect((result?.[0] as { payload: { remotes: typeof remotes } }).payload.remotes).toEqual(
      remotes,
    );
  });

  it('responds to repository.syncStatus.request with ahead/behind status', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const status = {
      repositoryId: 'repo-1',
      currentBranch: 'main',
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
    };
    const syncSpy = vi.spyOn(panel.gitOperationService, 'getSyncStatus').mockResolvedValue(status);

    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');
    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'sync-1',
      type: 'repository.syncStatus.request',
      payload: { repositoryId: 'repo-1' },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(syncSpy).toHaveBeenCalledWith('repo-1');
    const result = postSpy.mock.calls.find(
      (call) => (call[0] as { type?: string }).type === 'repository.syncStatus.result',
    );
    expect((result?.[0] as { payload: { status: typeof status } }).payload.status).toEqual(status);
  });

  it('requires modal confirmation before undoing an operation', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const undoSpy = vi
      .spyOn(panel.gitOperationService, 'undo')
      .mockResolvedValue({ operationId: 'undo-1', repositoryId: 'repo-1', success: true });
    const warningSpy = vi
      .spyOn(vscode.window, 'showWarningMessage')
      .mockResolvedValue('Undo' as never);

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'undo-1',
      type: 'operation.undo.request',
      payload: {
        repositoryId: 'repo-1',
        reflogIndex: 1,
        expectedSha: 'abcdef1234567890',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warningSpy).toHaveBeenCalledWith(
      expect.stringContaining('reset to abcdef1'),
      { modal: true },
      'Undo',
    );
    expect(undoSpy).toHaveBeenCalledWith({
      operationId: 'undo-1',
      repositoryId: 'repo-1',
      reflogIndex: 1,
      expectedSha: 'abcdef1234567890',
    });
  });

  it('does not undo and resolves the webview operation when confirmation is cancelled', async () => {
    const panel = GitGraphPanel.createOrShow(extensionUri);
    const undoSpy = vi.spyOn(panel.gitOperationService, 'undo');
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);
    const postSpy = vi.spyOn(panel.panel.webview, 'postMessage');

    const mockWebview = panel.panel.webview as unknown as MockWebview;
    mockWebview.fireMessage({
      protocolVersion: 1,
      id: 'undo-cancel',
      type: 'operation.undo.request',
      payload: { repositoryId: 'repo-1', reflogIndex: 1 },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(undoSpy).not.toHaveBeenCalled();
    const result = postSpy.mock.calls.find(
      (call) => (call[0] as { type?: string }).type === 'operation.result',
    );
    expect(result?.[0]).toMatchObject({
      payload: {
        requestId: 'undo-cancel',
        success: false,
        error: { code: 'OPERATION_CANCELLED' },
      },
    });
  });
});
