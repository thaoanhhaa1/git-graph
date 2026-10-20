import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { GitCliClient } from '@git-graph/git-core';
import type { RepositoryDescriptor } from '@git-graph/shared';
import { activate, deactivate } from '../../src/extension';
import { GitGraphPanel } from '../../src/webview/GitGraphPanel';
import { MockWebview } from '../__mocks__/vscode';

interface PostedMessage<TPayload = unknown> {
  id?: string;
  type: string;
  payload: TPayload;
}

interface E2EWorkspace {
  root: string;
  client: GitCliClient;
  fixtureSha: string;
  searchableSha: string;
}

const extensionUri = vscode.Uri.file(path.resolve('apps/extension'));

describe('M7.3: Extension E2E scenarios', () => {
  let tempDirs: string[] = [];
  let subscriptions: vscode.Disposable[] = [];

  beforeEach(() => {
    tempDirs = [];
    subscriptions = [];
    deactivate();
    GitGraphPanel.currentPanel?.dispose();
    setWorkspaceFolders(undefined);
  });

  afterEach(() => {
    deactivate();
    for (const subscription of subscriptions) {
      subscription.dispose();
    }
    subscriptions = [];
    setWorkspaceFolders(undefined);

    for (const tempDir of tempDirs) {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
    tempDirs = [];
  });

  it('opens Git workspace graph, displays fixture commits, details, and search results', async () => {
    const workspace = await createGitWorkspace();
    const { panel, webview, postSpy } = await openGraphForWorkspace(workspace.root);

    const repositories = await requestRepositories(webview, postSpy, 'repos-graph');
    expect(repositories).toHaveLength(1);

    const repository = repositories[0]!;
    expect(GitGraphPanel.currentPanel).toBe(panel);
    expect(repository.rootPath).toBe(fs.realpathSync(workspace.root));
    expect(repository.currentBranch).toBeTruthy();

    webview.fireMessage(
      message('commits.page.request', 'commits-1', {
        repositoryId: repository.id,
        limit: 20,
      }),
    );
    const commitsMessage = await waitForPostedMessage<{
      page: { commits: Array<{ sha: string; subject: string }> };
    }>(postSpy, 'commits.page.result', (msg) => msg.payload.page.commits.length >= 2);
    const commits = commitsMessage.payload.page.commits;
    expect(commits.map((commit) => commit.subject)).toContain('feat: graph fixture commit');

    webview.fireMessage(
      message('commit.details.request', 'details-1', {
        repositoryId: repository.id,
        sha: workspace.fixtureSha,
      }),
    );
    const detailsMessage = await waitForPostedMessage<{
      commit: { sha: string; subject: string; body?: string };
    }>(postSpy, 'commit.details.result', (msg) => msg.payload.commit.sha === workspace.fixtureSha);
    expect(detailsMessage.payload.commit.subject).toBe('feat: graph fixture commit');
    expect(detailsMessage.payload.commit.body ?? '').toContain('Body for details panel.');

    webview.fireMessage(
      message('search.request', 'search-subject', {
        repositoryId: repository.id,
        query: 'searchable subject',
        searchType: 'subject',
      }),
    );
    const subjectSearchMessage = await waitForPostedMessage<{
      requestId?: string;
      commits: Array<{ sha: string; subject: string }>;
    }>(postSpy, 'search.result', (msg) => msg.payload.requestId === 'search-subject');
    expect(
      subjectSearchMessage.payload.commits.some((commit) => commit.sha === workspace.searchableSha),
    ).toBe(true);

    webview.fireMessage(
      message('search.request', 'search-sha', {
        repositoryId: repository.id,
        query: workspace.fixtureSha.slice(0, 12),
        searchType: 'hash',
      }),
    );
    const shaSearchMessage = await waitForPostedMessage<{
      requestId?: string;
      commits: Array<{ sha: string }>;
    }>(postSpy, 'search.result', (msg) => msg.payload.requestId === 'search-sha');
    expect(
      shaSearchMessage.payload.commits.some((commit) => commit.sha === workspace.fixtureSha),
    ).toBe(true);
  });

  it('checks out a clean branch and reports dirty-worktree checkout warnings', async () => {
    const workspace = await createGitWorkspace();
    const { webview, postSpy } = await openGraphForWorkspace(workspace.root);
    const [repository] = await requestRepositories(webview, postSpy, 'repos-checkout');
    expect(repository).toBeDefined();

    await workspace.client.exec(['branch', 'clean-target'], { cwd: workspace.root });

    webview.fireMessage(
      message('operation.checkout.request', 'checkout-clean', {
        repositoryId: repository!.id,
        target: 'clean-target',
        targetType: 'localBranch',
      }),
    );
    const checkoutResult = await waitForPostedMessage<{
      requestId: string;
      success: boolean;
      data?: { checkedOutRef?: string };
    }>(postSpy, 'operation.result', (msg) => msg.payload.requestId === 'checkout-clean');
    expect(checkoutResult.payload.success).toBe(true);
    expect(checkoutResult.payload.data?.checkedOutRef).toBe('refs/heads/clean-target');

    await workspace.client.exec(['checkout', 'master'], { cwd: workspace.root }).catch(async () => {
      await workspace.client.exec(['checkout', 'main'], { cwd: workspace.root });
    });
    fs.appendFileSync(path.join(workspace.root, 'README.md'), 'dirty line\n', 'utf-8');

    webview.fireMessage(
      message('operation.checkout.request', 'checkout-dirty', {
        repositoryId: repository!.id,
        target: 'clean-target',
        targetType: 'localBranch',
      }),
    );
    const dirtyResult = await waitForPostedMessage<{
      requestId: string;
      success: boolean;
      error?: { message?: string };
    }>(postSpy, 'operation.result', (msg) => msg.payload.requestId === 'checkout-dirty');
    expect(dirtyResult.payload.success).toBe(false);
    expect(dirtyResult.payload.error?.message ?? '').toContain('uncommitted changes');
  });

  it('creates a branch and exposes the new ref after refresh', async () => {
    const workspace = await createGitWorkspace();
    const { webview, postSpy } = await openGraphForWorkspace(workspace.root);
    const [repository] = await requestRepositories(webview, postSpy, 'repos-branch');
    expect(repository).toBeDefined();

    webview.fireMessage(
      message('operation.branch.create.request', 'branch-create', {
        repositoryId: repository!.id,
        name: 'e2e-created-branch',
        startPoint: 'HEAD',
        checkout: false,
      }),
    );
    const createResult = await waitForPostedMessage<{
      requestId: string;
      success: boolean;
      data?: { branchRef?: string };
    }>(postSpy, 'operation.result', (msg) => msg.payload.requestId === 'branch-create');
    expect(createResult.payload.success).toBe(true);
    expect(createResult.payload.data?.branchRef).toBe('refs/heads/e2e-created-branch');

    webview.fireMessage(
      message('commits.page.request', 'commits-with-ref', {
        repositoryId: repository!.id,
        limit: 10,
      }),
    );
    const refreshedCommits = await waitForPostedMessage<{
      requestId?: string;
      page: { commits: Array<{ refs: Array<{ name: string; fullName?: string }> }> };
    }>(postSpy, 'commits.page.result', (msg) => msg.payload.requestId === 'commits-with-ref');
    expect(
      refreshedCommits.payload.page.commits.some((commit) =>
        commit.refs.some(
          (ref) =>
            ref.name === 'e2e-created-branch' || ref.fullName === 'refs/heads/e2e-created-branch',
        ),
      ),
    ).toBe(true);
  });

  it('shows an empty repository list for non-Git workspaces', async () => {
    const nonGitRoot = createTempDir('git-graph-m7-e2e-empty-');
    fs.writeFileSync(path.join(nonGitRoot, 'notes.txt'), 'not a git repository\n', 'utf-8');

    const { webview, postSpy } = await openGraphForWorkspace(nonGitRoot);
    const repositories = await requestRepositories(webview, postSpy, 'repos-empty');

    expect(repositories).toEqual([]);
  });

  async function createGitWorkspace(): Promise<E2EWorkspace> {
    const info = await GitCliClient.detect();
    const client = new GitCliClient(info.path);
    const root = createTempDir('git-graph-m7-e2e-');

    await client.exec(['init', root]);
    await client.exec(['config', 'user.name', 'Extension E2E Runner'], { cwd: root });
    await client.exec(['config', 'user.email', 'e2e@gitgraph.test'], { cwd: root });
    await client.exec(['config', 'commit.gpgsign', 'false'], { cwd: root });

    fs.writeFileSync(path.join(root, 'README.md'), '# Git Graph E2E\n', 'utf-8');
    await client.exec(['add', 'README.md'], { cwd: root });
    await client.exec(['commit', '-m', 'feat: graph fixture commit\n\nBody for details panel.'], {
      cwd: root,
    });
    const fixtureSha = (await client.exec(['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();

    fs.writeFileSync(path.join(root, 'search.txt'), 'search fixture\n', 'utf-8');
    await client.exec(['add', 'search.txt'], { cwd: root });
    await client.exec(['commit', '-m', 'fix: searchable subject commit'], { cwd: root });
    const searchableSha = (await client.exec(['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();

    return { root, client, fixtureSha, searchableSha };
  }

  function createTempDir(prefix: string): string {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(tempDir);
    return tempDir;
  }

  async function openGraphForWorkspace(root: string): Promise<{
    panel: GitGraphPanel;
    webview: MockWebview;
    postSpy: ReturnType<typeof vi.spyOn>;
  }> {
    setWorkspaceFolders([
      {
        uri: vscode.Uri.file(root),
        name: path.basename(root),
        index: 0,
      },
    ]);

    const context = { subscriptions, extensionUri } as unknown as vscode.ExtensionContext;
    activate(context);
    await vscode.commands.executeCommand('gitGraph.openGraph');

    const panel = GitGraphPanel.currentPanel;
    expect(panel).toBeDefined();
    const postSpy = vi.spyOn(panel!.panel.webview, 'postMessage');
    return {
      panel: panel!,
      webview: panel!.panel.webview as unknown as MockWebview,
      postSpy,
    };
  }

  async function requestRepositories(
    webview: MockWebview,
    postSpy: ReturnType<typeof vi.spyOn>,
    requestId: string,
  ): Promise<RepositoryDescriptor[]> {
    webview.fireMessage(message('repositories.list.request', requestId, { refresh: true }));
    const repositoriesMessage = await waitForPostedMessage<{
      requestId?: string;
      repositories: RepositoryDescriptor[];
    }>(
      postSpy,
      'repositories.list.result',
      (msg) => msg.id === requestId || msg.payload.requestId === requestId,
    );
    return repositoriesMessage.payload.repositories;
  }
});

function setWorkspaceFolders(
  folders: Array<{ uri: vscode.Uri; name: string; index: number }> | undefined,
): void {
  (vscode.workspace as { workspaceFolders: typeof folders }).workspaceFolders = folders;
}

function message<TPayload>(type: string, id: string, payload: TPayload): PostedMessage<TPayload> {
  return {
    protocolVersion: 1,
    id,
    type,
    payload,
  } as PostedMessage<TPayload>;
}

async function waitForPostedMessage<TPayload>(
  postSpy: ReturnType<typeof vi.spyOn>,
  type: string,
  predicate: (message: PostedMessage<TPayload>) => boolean = () => true,
): Promise<PostedMessage<TPayload>> {
  const deadline = Date.now() + 3_000;

  while (Date.now() < deadline) {
    for (const call of postSpy.mock.calls) {
      const candidate = call[0] as PostedMessage<TPayload>;
      if (candidate?.type === type && predicate(candidate)) {
        return candidate;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const seenTypes = postSpy.mock.calls.map((call) => (call[0] as PostedMessage | undefined)?.type);
  throw new Error(`Timed out waiting for ${type}; saw: ${seenTypes.join(', ')}`);
}
