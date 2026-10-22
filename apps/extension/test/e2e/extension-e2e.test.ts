import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { GitCliClient } from '@git-graph/git-core';
import type { RepositoryDescriptor } from '@git-graph/shared';
import { activate, deactivate } from '../../src/extension';
import { GitGraphPanel } from '../../src/webview/GitGraphPanel';
import {
  MockTextDocument,
  MockTextEditor,
  MockWebview,
  Position,
  Selection,
  resetMockConfiguration,
  setMockConfigurationValue,
  window,
} from '../__mocks__/vscode';

interface PostedMessage<TPayload = unknown> {
  id?: string;
  type: string;
  payload: TPayload;
}

interface CommitsPageChunkPayload {
  requestId?: string;
  repositoryId: string;
  page: {
    commits: Array<{ sha: string; subject: string; refs: Array<{ name: string }> }>;
    cursor?: string;
    hasMore?: boolean;
  };
  chunkIndex?: number;
  totalChunks?: number;
  isLastChunk?: boolean;
}

interface E2EWorkspace {
  root: string;
  client: GitCliClient;
  fixtureSha: string;
  searchableSha: string;
  baseBranch: string;
}

const extensionUri = vscode.Uri.file(path.resolve('apps/extension'));

describe('M20.1: Extension E2E scenarios (E1-E10)', () => {
  let tempDirs: string[] = [];
  let subscriptions: vscode.Disposable[] = [];

  beforeEach(() => {
    tempDirs = [];
    subscriptions = [];
    resetMockConfiguration();
    deactivate();
    GitGraphPanel.currentPanel?.dispose();
    setWorkspaceFolders(undefined);
    window.visibleTextEditors = [];
    window.activeTextEditor = undefined;
  });

  afterEach(() => {
    deactivate();
    for (const subscription of subscriptions) {
      subscription.dispose();
    }
    subscriptions = [];
    setWorkspaceFolders(undefined);
    window.visibleTextEditors = [];
    window.activeTextEditor = undefined;

    for (const tempDir of tempDirs) {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
    tempDirs = [];
  });

  it('E1: opens the graph, renders fixture commits, details, and search results', async () => {
    const workspace = await createGitWorkspace();
    const { panel, webview, postSpy } = await openGraphForWorkspace([workspace.root]);

    const repositories = await requestRepositories(webview, postSpy, 'repos-graph');
    expect(repositories).toHaveLength(1);

    const repository = repositories[0]!;
    expect(GitGraphPanel.currentPanel).toBe(panel);
    expect(repository.rootPath).toBe(fs.realpathSync(workspace.root));
    expect(repository.currentBranch).toBeTruthy();

    const commits = await collectCommitPage(webview, postSpy, 'commits-1', {
      repositoryId: repository.id,
      limit: 20,
    });
    expect(commits.commits.map((commit) => commit.subject)).toContain('feat: graph fixture commit');
    expect(commits.commits[0]!.refs.length).toBeGreaterThanOrEqual(0);

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
  });

  it('E2: searches by subject/author/hash and applies path filters', async () => {
    const workspace = await createGitWorkspace();
    const { webview, postSpy } = await openGraphForWorkspace([workspace.root]);
    const [repository] = await requestRepositories(webview, postSpy, 'repos-search');
    expect(repository).toBeDefined();

    webview.fireMessage(
      message('search.request', 'search-subject', {
        repositoryId: repository!.id,
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
      message('search.request', 'search-author', {
        repositoryId: repository!.id,
        query: 'Extension E2E Runner',
        searchType: 'author',
      }),
    );
    const authorSearchMessage = await waitForPostedMessage<{
      requestId?: string;
      commits: Array<{ sha: string }>;
    }>(postSpy, 'search.result', (msg) => msg.payload.requestId === 'search-author');
    expect(authorSearchMessage.payload.commits.length).toBeGreaterThanOrEqual(2);

    webview.fireMessage(
      message('search.request', 'search-hash', {
        repositoryId: repository!.id,
        query: workspace.fixtureSha.slice(0, 12),
        searchType: 'hash',
      }),
    );
    const shaSearchMessage = await waitForPostedMessage<{
      requestId?: string;
      commits: Array<{ sha: string }>;
    }>(postSpy, 'search.result', (msg) => msg.payload.requestId === 'search-hash');
    expect(
      shaSearchMessage.payload.commits.some((commit) => commit.sha === workspace.fixtureSha),
    ).toBe(true);

    const pathFiltered = await collectCommitPage(webview, postSpy, 'commits-path-filter', {
      repositoryId: repository!.id,
      limit: 20,
      path: 'search.txt',
    });
    const pathShas = pathFiltered.commits.map((commit) => commit.sha);
    expect(pathShas).toContain(workspace.searchableSha);
    expect(pathShas).not.toContain(workspace.fixtureSha);
  });

  it('E3: stages files, creates a commit, and refreshes the graph', async () => {
    const workspace = await createGitWorkspace();
    const { webview, postSpy } = await openGraphForWorkspace([workspace.root]);
    const [repository] = await requestRepositories(webview, postSpy, 'repos-commit');
    expect(repository).toBeDefined();

    fs.writeFileSync(path.join(workspace.root, 'staged.txt'), 'staged content\n', 'utf-8');
    webview.fireMessage(
      message('worktree.stage.request', 'stage-1', {
        repositoryId: repository!.id,
        paths: ['staged.txt'],
      }),
    );
    const stageResult = await waitForPostedMessage<{ requestId: string; success: boolean }>(
      postSpy,
      'operation.result',
      (msg) => msg.payload.requestId === 'stage-1',
    );
    expect(stageResult.payload.success).toBe(true);

    webview.fireMessage(
      message('operation.commit.create.request', 'commit-1', {
        repositoryId: repository!.id,
        message: 'feat: e2e direct commit',
        description: 'Created by the E2E suite.',
      }),
    );
    const commitResult = await waitForPostedMessage<{ requestId: string; success: boolean }>(
      postSpy,
      'operation.result',
      (msg) => msg.payload.requestId === 'commit-1',
    );
    expect(commitResult.payload.success).toBe(true);

    const latestSubject = (
      await workspace.client.exec(['log', '-1', '--pretty=%s'], { cwd: workspace.root })
    ).stdout.trim();
    expect(latestSubject).toBe('feat: e2e direct commit');

    const commits = await collectCommitPage(webview, postSpy, 'commits-after-commit', {
      repositoryId: repository!.id,
      limit: 20,
    });
    expect(commits.commits[0]!.subject).toBe('feat: e2e direct commit');
  });

  it('E4: creates, checks out, and deletes a branch', async () => {
    const workspace = await createGitWorkspace();
    const { webview, postSpy } = await openGraphForWorkspace([workspace.root]);
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
      message('operation.checkout.request', 'branch-checkout', {
        repositoryId: repository!.id,
        target: 'e2e-created-branch',
        targetType: 'localBranch',
      }),
    );
    const checkoutResult = await waitForPostedMessage<{
      requestId: string;
      success: boolean;
      data?: { checkedOutRef?: string };
    }>(postSpy, 'operation.result', (msg) => msg.payload.requestId === 'branch-checkout');
    expect(checkoutResult.payload.success).toBe(true);
    expect(checkoutResult.payload.data?.checkedOutRef).toBe('refs/heads/e2e-created-branch');

    webview.fireMessage(
      message('operation.checkout.request', 'branch-back', {
        repositoryId: repository!.id,
        target: workspace.baseBranch,
        targetType: 'localBranch',
      }),
    );
    await waitForPostedMessage<{ requestId: string; success: boolean }>(
      postSpy,
      'operation.result',
      (msg) => msg.payload.requestId === 'branch-back',
    );

    webview.fireMessage(
      message('operation.branch.delete.request', 'branch-delete', {
        repositoryId: repository!.id,
        branchName: 'e2e-created-branch',
      }),
    );
    const deleteResult = await waitForPostedMessage<{ requestId: string; success: boolean }>(
      postSpy,
      'operation.result',
      (msg) => msg.payload.requestId === 'branch-delete',
    );
    expect(deleteResult.payload.success).toBe(true);

    const remainingBranches = (
      await workspace.client.exec(['branch', '--list', 'e2e-created-branch'], {
        cwd: workspace.root,
      })
    ).stdout.trim();
    expect(remainingBranches).toBe('');
  });

  it('E5: merges a feature branch with a merge commit', async () => {
    const workspace = await createGitWorkspace();
    const { webview, postSpy } = await openGraphForWorkspace([workspace.root]);
    const [repository] = await requestRepositories(webview, postSpy, 'repos-merge');
    expect(repository).toBeDefined();

    webview.fireMessage(
      message('operation.branch.create.request', 'merge-branch-create', {
        repositoryId: repository!.id,
        name: 'e2e-merge-feature',
        startPoint: 'HEAD',
        checkout: true,
      }),
    );
    await waitForPostedMessage<{ requestId: string; success: boolean }>(
      postSpy,
      'operation.result',
      (msg) => msg.payload.requestId === 'merge-branch-create',
    );

    fs.writeFileSync(path.join(workspace.root, 'feature.txt'), 'feature work\n', 'utf-8');
    webview.fireMessage(
      message('worktree.stage.request', 'merge-stage', {
        repositoryId: repository!.id,
        paths: ['feature.txt'],
      }),
    );
    await waitForPostedMessage<{ requestId: string; success: boolean }>(
      postSpy,
      'operation.result',
      (msg) => msg.payload.requestId === 'merge-stage',
    );

    webview.fireMessage(
      message('operation.commit.create.request', 'merge-commit', {
        repositoryId: repository!.id,
        message: 'feat: e2e feature commit',
      }),
    );
    await waitForPostedMessage<{ requestId: string; success: boolean }>(
      postSpy,
      'operation.result',
      (msg) => msg.payload.requestId === 'merge-commit',
    );

    webview.fireMessage(
      message('operation.checkout.request', 'merge-checkout-back', {
        repositoryId: repository!.id,
        target: workspace.baseBranch,
        targetType: 'localBranch',
      }),
    );
    await waitForPostedMessage<{ requestId: string; success: boolean }>(
      postSpy,
      'operation.result',
      (msg) => msg.payload.requestId === 'merge-checkout-back',
    );

    webview.fireMessage(
      message('operation.merge.request', 'merge-run', {
        repositoryId: repository!.id,
        target: 'e2e-merge-feature',
        fastForwardMode: 'no-ff',
        noConfirm: true,
      }),
    );
    const mergeResult = await waitForPostedMessage<{ requestId: string; success: boolean }>(
      postSpy,
      'operation.result',
      (msg) => msg.payload.requestId === 'merge-run',
    );
    expect(mergeResult.payload.success).toBe(true);

    const mergeSubject = (
      await workspace.client.exec(['log', '-1', '--pretty=%s'], { cwd: workspace.root })
    ).stdout.trim();
    expect(mergeSubject.toLowerCase()).toContain('merge');

    const parents = (
      await workspace.client.exec(['log', '-1', '--pretty=%P'], { cwd: workspace.root })
    ).stdout.trim();
    expect(parents.split(/\s+/).filter(Boolean)).toHaveLength(2);
  });

  it('E6: saves a stash, lists it, and pops it back into the worktree', async () => {
    const workspace = await createGitWorkspace();
    const { webview, postSpy } = await openGraphForWorkspace([workspace.root]);
    const [repository] = await requestRepositories(webview, postSpy, 'repos-stash');
    expect(repository).toBeDefined();

    const readmePath = path.join(workspace.root, 'README.md');
    fs.appendFileSync(readmePath, 'stashed line\n', 'utf-8');

    webview.fireMessage(
      message('stash.save.request', 'stash-save', {
        repositoryId: repository!.id,
        message: 'e2e stash entry',
        includeUntracked: true,
      }),
    );
    const saveResult = await waitForPostedMessage<{ requestId: string; success: boolean }>(
      postSpy,
      'operation.result',
      (msg) => msg.payload.requestId === 'stash-save',
    );
    expect(saveResult.payload.success).toBe(true);
    expect(fs.readFileSync(readmePath, 'utf-8')).not.toContain('stashed line');

    webview.fireMessage(
      message('stash.list.request', 'stash-list', {
        repositoryId: repository!.id,
      }),
    );
    const stashList = await waitForPostedMessage<{
      stashes: Array<{ index: number; message?: string }>;
    }>(postSpy, 'stash.list.result', (msg) => msg.payload.stashes.length >= 1);
    expect(stashList.payload.stashes.length).toBeGreaterThanOrEqual(1);

    webview.fireMessage(
      message('stash.pop.request', 'stash-pop', {
        repositoryId: repository!.id,
        index: 0,
      }),
    );
    const popResult = await waitForPostedMessage<{ requestId: string; success: boolean }>(
      postSpy,
      'operation.result',
      (msg) => msg.payload.requestId === 'stash-pop',
    );
    expect(popResult.payload.success).toBe(true);
    expect(fs.readFileSync(readmePath, 'utf-8')).toContain('stashed line');
  });

  it('E7: pushes to a remote and pulls new commits back', async () => {
    const workspace = await createGitWorkspace();
    const { webview, postSpy } = await openGraphForWorkspace([workspace.root]);
    const [repository] = await requestRepositories(webview, postSpy, 'repos-sync');
    expect(repository).toBeDefined();

    const remoteRoot = createTempDir('git-graph-e2e-remote-');
    await workspace.client.exec(['init', '--bare', remoteRoot]);
    await workspace.client.exec(['remote', 'add', 'origin', remoteRoot], { cwd: workspace.root });

    webview.fireMessage(
      message('operation.push.request', 'push-1', {
        repositoryId: repository!.id,
        branchName: workspace.baseBranch,
        remote: 'origin',
        setUpstream: true,
      }),
    );
    const pushResult = await waitForPostedMessage<{ requestId: string; success: boolean }>(
      postSpy,
      'operation.result',
      (msg) => msg.payload.requestId === 'push-1',
    );
    expect(pushResult.payload.success).toBe(true);

    const remoteRefs = (
      await workspace.client.exec(['ls-remote', 'origin'], { cwd: workspace.root })
    ).stdout;
    expect(remoteRefs).toContain(`refs/heads/${workspace.baseBranch}`);

    const cloneRoot = createTempDir('git-graph-e2e-clone-');
    await workspace.client.exec(['clone', remoteRoot, cloneRoot]);
    await workspace.client.exec(['config', 'user.name', 'E2E Clone'], { cwd: cloneRoot });
    await workspace.client.exec(['config', 'user.email', 'clone@gitgraph.test'], {
      cwd: cloneRoot,
    });
    fs.writeFileSync(path.join(cloneRoot, 'remote-only.txt'), 'from clone\n', 'utf-8');
    await workspace.client.exec(['add', 'remote-only.txt'], { cwd: cloneRoot });
    await workspace.client.exec(['commit', '-m', 'feat: remote-only commit'], { cwd: cloneRoot });
    await workspace.client.exec(['push', 'origin', workspace.baseBranch], { cwd: cloneRoot });
    const cloneHead = (
      await workspace.client.exec(['rev-parse', 'HEAD'], { cwd: cloneRoot })
    ).stdout.trim();

    webview.fireMessage(
      message('operation.pull.request', 'pull-1', {
        repositoryId: repository!.id,
        remote: 'origin',
        strategy: 'ff-only',
      }),
    );
    const pullResult = await waitForPostedMessage<{ requestId: string; success: boolean }>(
      postSpy,
      'operation.result',
      (msg) => msg.payload.requestId === 'pull-1',
    );
    expect(pullResult.payload.success).toBe(true);

    const localHead = (
      await workspace.client.exec(['rev-parse', 'HEAD'], { cwd: workspace.root })
    ).stdout.trim();
    expect(localHead).toBe(cloneHead);
  });

  it('E8: toggles inline blame decorations for the active editor', async () => {
    const workspace = await createGitWorkspace();
    await openGraphForWorkspace([workspace.root]);

    const readmePath = path.join(workspace.root, 'README.md');
    const document = new MockTextDocument(readmePath, fs.readFileSync(readmePath, 'utf-8'));
    const editor = new MockTextEditor(
      document,
      new Selection(new Position(0, 0), new Position(0, 0)),
    );
    window.activeTextEditor = editor as never;
    window._setVisibleTextEditors([editor]);
    window._fireDidChangeActiveTextEditor(editor);

    setMockConfigurationValue('gitGraph.blame.enabled', false);
    await vscode.commands.executeCommand('gitGraph.toggleBlame');

    await waitFor(async () => editor.appliedDecorations.size > 0);
    expect(editor.appliedDecorations.size).toBeGreaterThan(0);
  });

  it('E9: switches between multiple discovered repositories', async () => {
    const first = await createGitWorkspace('git-graph-e2e-multi-a-');
    const second = await createGitWorkspace('git-graph-e2e-multi-b-');
    fs.writeFileSync(path.join(second.root, 'second.txt'), 'second repo\n', 'utf-8');
    await second.client.exec(['add', 'second.txt'], { cwd: second.root });
    await second.client.exec(['commit', '-m', 'feat: second repository commit'], {
      cwd: second.root,
    });

    const { webview, postSpy } = await openGraphForWorkspace([first.root, second.root]);
    const repositories = await requestRepositories(webview, postSpy, 'repos-multi');
    expect(repositories).toHaveLength(2);

    const secondRepository = repositories.find(
      (repository) => repository.rootPath === fs.realpathSync(second.root),
    );
    expect(secondRepository).toBeDefined();

    webview.fireMessage(
      message('repository.select', 'select-second', {
        repositoryId: secondRepository!.id,
      }),
    );

    const commits = await collectCommitPage(webview, postSpy, 'commits-second', {
      repositoryId: secondRepository!.id,
      limit: 20,
    });
    expect(commits.commits[0]!.subject).toBe('feat: second repository commit');
  });

  it('E10: pages through a large synthetic history without dropping rows', async () => {
    const workspace = await createGitWorkspace('git-graph-e2e-large-');
    const totalCommits = 2_500;
    await workspace.client.exec(['config', 'user.name', 'Large History Bot'], {
      cwd: workspace.root,
    });
    await workspace.client.exec(['config', 'user.email', 'large@gitgraph.test'], {
      cwd: workspace.root,
    });
    await seedSyntheticHistory(workspace.client, workspace.root, totalCommits);

    const { webview, postSpy } = await openGraphForWorkspace([workspace.root]);
    const [repository] = await requestRepositories(webview, postSpy, 'repos-large');
    expect(repository).toBeDefined();

    const seenShas = new Set<string>();
    let cursor: string | undefined;
    let hasMore = true;
    let pageIndex = 0;

    while (hasMore && pageIndex < 10) {
      const page = await collectCommitPage(webview, postSpy, `large-page-${pageIndex}`, {
        repositoryId: repository!.id,
        limit: 500,
        ...(cursor ? { cursor } : {}),
      });
      for (const commit of page.commits) {
        seenShas.add(commit.sha);
      }
      cursor = page.cursor;
      hasMore = Boolean(page.hasMore);
      pageIndex += 1;
    }

    expect(seenShas.size).toBeGreaterThanOrEqual(totalCommits);
    expect(hasMore).toBe(false);
  });

  async function createGitWorkspace(prefix = 'git-graph-e2e-'): Promise<E2EWorkspace> {
    const info = await GitCliClient.detect();
    const client = new GitCliClient(info.path);
    const root = createTempDir(prefix);

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
    const baseBranch = (
      await client.exec(['symbolic-ref', '--short', 'HEAD'], { cwd: root })
    ).stdout.trim();

    return { root, client, fixtureSha, searchableSha, baseBranch };
  }

  function createTempDir(prefix: string): string {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(tempDir);
    return tempDir;
  }

  async function openGraphForWorkspace(roots: string[]): Promise<{
    panel: GitGraphPanel;
    webview: MockWebview;
    postSpy: ReturnType<typeof vi.spyOn>;
  }> {
    setWorkspaceFolders(
      roots.map((root, index) => ({
        uri: vscode.Uri.file(root),
        name: path.basename(root),
        index,
      })),
    );

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

  async function collectCommitPage(
    webview: MockWebview,
    postSpy: ReturnType<typeof vi.spyOn>,
    requestId: string,
    payload: Record<string, unknown>,
  ): Promise<{
    commits: CommitsPageChunkPayload['page']['commits'];
    cursor?: string;
    hasMore: boolean;
  }> {
    webview.fireMessage(message('commits.page.request', requestId, payload));

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const chunks = postSpy.mock.calls
        .map((call) => call[0] as PostedMessage<CommitsPageChunkPayload> | undefined)
        .filter(
          (candidate): candidate is PostedMessage<CommitsPageChunkPayload> =>
            candidate?.type === 'commits.page.result' && candidate.payload?.requestId === requestId,
        );

      const lastChunk = chunks.find((chunk) => chunk.payload.isLastChunk !== false);
      if (lastChunk) {
        chunks.sort((a, b) => (a.payload.chunkIndex ?? 0) - (b.payload.chunkIndex ?? 0));
        return {
          commits: chunks.flatMap((chunk) => chunk.payload.page.commits),
          cursor: lastChunk.payload.page.cursor,
          hasMore: Boolean(lastChunk.payload.page.hasMore),
        };
      }
      await delay(10);
    }

    throw new Error(`Timed out collecting commit page for ${requestId}`);
  }
});

async function seedSyntheticHistory(
  client: GitCliClient,
  root: string,
  count: number,
): Promise<void> {
  const lines: string[] = [
    'blob',
    'mark :1',
    'data 6',
    'hello',
    '',
    'blob',
    'mark :2',
    'data 12',
    'placeholder',
    '',
  ];

  for (let index = 0; index < count; index++) {
    const timestamp = 1_700_000_000 + index * 60;
    const subject = `synthetic commit ${index}`;
    lines.push('commit refs/heads/main');
    lines.push(`mark :${index + 3}`);
    lines.push(`author Large History Bot <large@gitgraph.test> ${timestamp} +0000`);
    lines.push(`committer Large History Bot <large@gitgraph.test> ${timestamp} +0000`);
    lines.push(`data ${Buffer.byteLength(subject, 'utf8')}`);
    lines.push(subject);
    if (index > 0) {
      lines.push(`from :${index + 2}`);
    }
    lines.push('M 100644 :2 history.txt');
    lines.push('');
  }

  await client.exec(['fast-import', '--quiet', '--force'], {
    cwd: root,
    stdin: `${lines.join('\n')}\n`,
  });
  await client.exec(['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: root });
  await client.exec(['reset', '--hard', '--quiet'], { cwd: root });
}

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
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    for (const call of postSpy.mock.calls) {
      const candidate = call[0] as PostedMessage<TPayload>;
      if (candidate?.type === type && predicate(candidate)) {
        return candidate;
      }
    }
    await delay(10);
  }

  const seenTypes = postSpy.mock.calls.map((call) => (call[0] as PostedMessage | undefined)?.type);
  throw new Error(`Timed out waiting for ${type}; saw: ${seenTypes.join(', ')}`);
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await delay(25);
  }
  throw new Error('Timed out waiting for condition');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
