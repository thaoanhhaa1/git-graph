import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

interface PostedMessage<TPayload = unknown> {
  id?: string;
  type: string;
  payload: TPayload;
}

interface RepositoryDescriptor {
  id: string;
  rootPath: string;
  name: string;
  currentBranch?: string;
}

interface CommitSummary {
  sha: string;
  subject: string;
  refs: Array<{ name: string; fullName?: string }>;
}

interface CommitsPageChunkPayload {
  requestId?: string;
  repositoryId: string;
  page: {
    commits: CommitSummary[];
    cursor?: string;
    hasMore?: boolean;
  };
  chunkIndex?: number;
  totalChunks?: number;
  isLastChunk?: boolean;
}

interface OperationResultPayload {
  requestId: string;
  success: boolean;
  error?: { message?: string };
  data?: Record<string, unknown>;
}

const REPOSITORIES_REQUEST_TIMEOUT_MS = 15_000;
const OPERATION_TIMEOUT_MS = 30_000;
const PAGE_TIMEOUT_MS = 30_000;

type Scenario = [name: string, run: () => Promise<void>];

/**
 * Entry point invoked by @vscode/test-electron inside the extension host.
 */
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('CTS.cts-git-graph');
  assert.ok(extension, 'Git Graph extension is not installed in the test host.');
  await extension.activate();

  const scenarios: Scenario[] = [
    ['E1: Open & Render', scenarioOpenAndRender],
    ['E2: Search & Filter', scenarioSearchAndFilter],
    ['E3: Commit Workflow', scenarioCommitWorkflow],
    ['E4: Branch Operations', scenarioBranchOperations],
    ['E5: Merge Workflow', scenarioMergeWorkflow],
    ['E6: Stash Workflow', scenarioStashWorkflow],
    ['E7: Push & Pull', scenarioPushAndPull],
    ['E8: Blame Toggle', scenarioBlameToggle],
    ['E9: Multi-Repo', scenarioMultiRepo],
    ['E10: Large Repo Paging', scenarioLargeRepo],
  ];

  const failures: string[] = [];
  for (const [name, runScenario] of scenarios) {
    try {
      await clearMessages();
      await runScenario();
      console.log(`[PASS] ${name}`);
    } catch (error) {
      failures.push(`${name}: ${formatError(error)}`);
      console.error(`[FAIL] ${name}`, error);
    }
  }

  if (failures.length > 0) {
    throw new Error(`E2E failures:\n${failures.join('\n')}`);
  }
}

async function scenarioOpenAndRender(): Promise<void> {
  const repositories = await openGraphAndListRepositories('e1-repos');
  assert.ok(repositories.length >= 2, 'Expected at least two workspace repositories.');

  const primary = findPrimaryRepository(repositories);
  const page = await collectCommitPage('e1-commits', {
    repositoryId: primary.id,
    limit: 20,
  });
  assert.ok(
    page.commits.some((commit) => commit.subject === 'feat: graph fixture commit'),
    'Fixture commit missing from the first page.',
  );
}

async function scenarioSearchAndFilter(): Promise<void> {
  const repositories = await openGraphAndListRepositories('e2-repos');
  const primary = findPrimaryRepository(repositories);

  const searchResult = await sendAndWait<{
    commits: CommitSummary[];
  }>('search.request', 'e2-search', 'search.result', {
    repositoryId: primary.id,
    query: 'searchable subject',
    searchType: 'subject',
  });
  assert.ok(
    searchResult.payload.commits.some(
      (commit) => commit.subject === 'fix: searchable subject commit',
    ),
    'Subject search did not find the searchable commit.',
  );

  const pathFiltered = await collectCommitPage('e2-path', {
    repositoryId: primary.id,
    limit: 20,
    path: 'search.txt',
  });
  assert.ok(
    pathFiltered.commits.some((commit) => commit.subject === 'fix: searchable subject commit'),
    'Path filter did not include the commit touching search.txt.',
  );
  assert.ok(
    !pathFiltered.commits.some((commit) => commit.subject === 'feat: graph fixture commit'),
    'Path filter leaked a commit that does not touch search.txt.',
  );
}

async function scenarioCommitWorkflow(): Promise<void> {
  const repositories = await openGraphAndListRepositories('e3-repos');
  const primary = findPrimaryRepository(repositories);
  const root = primary.rootPath;

  fs.writeFileSync(path.join(root, 'e2e-staged.txt'), 'staged by e2e\n', 'utf-8');
  await sendAndWait<OperationResultPayload>(
    'worktree.stage.request',
    'e3-stage',
    'operation.result',
    { repositoryId: primary.id, paths: ['e2e-staged.txt'] },
    (message) => message.payload.requestId === 'e3-stage',
  );

  const commitResult = await sendAndWait<OperationResultPayload>(
    'operation.commit.create.request',
    'e3-commit',
    'operation.result',
    { repositoryId: primary.id, message: 'feat: real-host e2e commit' },
    (message) => message.payload.requestId === 'e3-commit',
  );
  assert.equal(commitResult.payload.success, true, formatFailure(commitResult.payload));

  const latest = git(root, ['log', '-1', '--pretty=%s']).trim();
  assert.equal(latest, 'feat: real-host e2e commit');
}

async function scenarioBranchOperations(): Promise<void> {
  const repositories = await openGraphAndListRepositories('e4-repos');
  const primary = findPrimaryRepository(repositories);
  const baseBranch = currentBranch(primary.rootPath);
  const branchName = `e2e-real-branch-${Date.now()}`;

  const createResult = await sendAndWait<OperationResultPayload>(
    'operation.branch.create.request',
    'e4-create',
    'operation.result',
    {
      repositoryId: primary.id,
      name: branchName,
      startPoint: 'HEAD',
      checkout: true,
    },
    (message) => message.payload.requestId === 'e4-create',
  );
  assert.equal(createResult.payload.success, true, formatFailure(createResult.payload));
  assert.equal(currentBranch(primary.rootPath), branchName);

  const checkoutResult = await sendAndWait<OperationResultPayload>(
    'operation.checkout.request',
    'e4-back',
    'operation.result',
    {
      repositoryId: primary.id,
      target: baseBranch,
      targetType: 'localBranch',
    },
    (message) => message.payload.requestId === 'e4-back',
  );
  assert.equal(checkoutResult.payload.success, true, formatFailure(checkoutResult.payload));

  const deleteResult = await sendAndWait<OperationResultPayload>(
    'operation.branch.delete.request',
    'e4-delete',
    'operation.result',
    { repositoryId: primary.id, branchName },
    (message) => message.payload.requestId === 'e4-delete',
  );
  assert.equal(deleteResult.payload.success, true, formatFailure(deleteResult.payload));
  assert.equal(git(primary.rootPath, ['branch', '--list', branchName]).trim(), '');
}

async function scenarioMergeWorkflow(): Promise<void> {
  const repositories = await openGraphAndListRepositories('e5-repos');
  const primary = findPrimaryRepository(repositories);
  const baseBranch = currentBranch(primary.rootPath);
  const branchName = `e2e-merge-${Date.now()}`;

  await sendAndWait<OperationResultPayload>(
    'operation.branch.create.request',
    'e5-create',
    'operation.result',
    { repositoryId: primary.id, name: branchName, startPoint: 'HEAD', checkout: true },
    (message) => message.payload.requestId === 'e5-create',
  );

  fs.writeFileSync(path.join(primary.rootPath, 'e2e-feature.txt'), 'feature\n', 'utf-8');
  await sendAndWait<OperationResultPayload>(
    'worktree.stage.request',
    'e5-stage',
    'operation.result',
    { repositoryId: primary.id, paths: ['e2e-feature.txt'] },
    (message) => message.payload.requestId === 'e5-stage',
  );
  await sendAndWait<OperationResultPayload>(
    'operation.commit.create.request',
    'e5-commit',
    'operation.result',
    { repositoryId: primary.id, message: 'feat: real-host merge fixture' },
    (message) => message.payload.requestId === 'e5-commit',
  );

  await sendAndWait<OperationResultPayload>(
    'operation.checkout.request',
    'e5-back',
    'operation.result',
    { repositoryId: primary.id, target: baseBranch, targetType: 'localBranch' },
    (message) => message.payload.requestId === 'e5-back',
  );

  const mergeResult = await sendAndWait<OperationResultPayload>(
    'operation.merge.request',
    'e5-merge',
    'operation.result',
    {
      repositoryId: primary.id,
      target: branchName,
      fastForwardMode: 'no-ff',
      noConfirm: true,
    },
    (message) => message.payload.requestId === 'e5-merge',
  );
  assert.equal(mergeResult.payload.success, true, formatFailure(mergeResult.payload));

  const parents = git(primary.rootPath, ['log', '-1', '--pretty=%P']).trim();
  assert.equal(parents.split(/\s+/).filter(Boolean).length, 2, 'Expected a merge commit.');
}

async function scenarioStashWorkflow(): Promise<void> {
  const repositories = await openGraphAndListRepositories('e6-repos');
  const primary = findPrimaryRepository(repositories);
  const readmePath = path.join(primary.rootPath, 'README.md');
  const marker = `stashed-${Date.now()}`;

  fs.appendFileSync(readmePath, `${marker}\n`, 'utf-8');

  const saveResult = await sendAndWait<OperationResultPayload>(
    'stash.save.request',
    'e6-save',
    'operation.result',
    {
      repositoryId: primary.id,
      message: 'real-host e2e stash',
      includeUntracked: true,
    },
    (message) => message.payload.requestId === 'e6-save',
  );
  assert.equal(saveResult.payload.success, true, formatFailure(saveResult.payload));
  assert.ok(!fs.readFileSync(readmePath, 'utf-8').includes(marker));

  const listMessage = await sendAndWait<{ stashes: Array<{ index: number }> }>(
    'stash.list.request',
    'e6-list',
    'stash.list.result',
    { repositoryId: primary.id },
    (message) => message.payload.stashes.length > 0,
  );
  assert.ok(listMessage.payload.stashes.length > 0);

  const popResult = await sendAndWait<OperationResultPayload>(
    'stash.pop.request',
    'e6-pop',
    'operation.result',
    { repositoryId: primary.id, index: 0 },
    (message) => message.payload.requestId === 'e6-pop',
  );
  assert.equal(popResult.payload.success, true, formatFailure(popResult.payload));
  assert.ok(fs.readFileSync(readmePath, 'utf-8').includes(marker));
}

async function scenarioPushAndPull(): Promise<void> {
  const repositories = await openGraphAndListRepositories('e7-repos');
  const primary = findPrimaryRepository(repositories);
  ensureCleanWorktree(primary.rootPath);
  const baseBranch = currentBranch(primary.rootPath);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-host-sync-'));
  const remoteRoot = path.join(tempRoot, 'remote.git');
  const cloneRoot = path.join(tempRoot, 'clone');

  try {
    git(tempRoot, ['init', '--bare', remoteRoot]);
    git(primary.rootPath, ['remote', 'add', 'origin', remoteRoot]);

    const pushResult = await sendAndWait<OperationResultPayload>(
      'operation.push.request',
      'e7-push',
      'operation.result',
      {
        repositoryId: primary.id,
        branchName: baseBranch,
        remote: 'origin',
        setUpstream: true,
      },
      (message) => message.payload.requestId === 'e7-push',
    );
    assert.equal(pushResult.payload.success, true, formatFailure(pushResult.payload));

    git(tempRoot, ['clone', remoteRoot, cloneRoot]);
    git(cloneRoot, ['config', 'user.name', 'Host E2E Clone']);
    git(cloneRoot, ['config', 'user.email', 'host-clone@gitgraph.test']);
    fs.writeFileSync(path.join(cloneRoot, 'remote-only.txt'), 'remote\n', 'utf-8');
    git(cloneRoot, ['add', 'remote-only.txt']);
    git(cloneRoot, ['commit', '-m', 'feat: host remote commit']);
    git(cloneRoot, ['push', 'origin', baseBranch]);
    const cloneHead = git(cloneRoot, ['rev-parse', 'HEAD']).trim();

    const pullResult = await sendAndWait<OperationResultPayload>(
      'operation.pull.request',
      'e7-pull',
      'operation.result',
      { repositoryId: primary.id, remote: 'origin', strategy: 'ff-only' },
      (message) => message.payload.requestId === 'e7-pull',
    );
    assert.equal(pullResult.payload.success, true, formatFailure(pullResult.payload));
    assert.equal(git(primary.rootPath, ['rev-parse', 'HEAD']).trim(), cloneHead);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function scenarioBlameToggle(): Promise<void> {
  const repositories = await openGraphAndListRepositories('e8-repos');
  const primary = findPrimaryRepository(repositories);
  const readmePath = path.join(primary.rootPath, 'README.md');
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(readmePath));
  await vscode.window.showTextDocument(document);

  const configuration = vscode.workspace.getConfiguration('gitGraph.blame');
  const before = configuration.get<boolean>('enabled', false);
  await vscode.commands.executeCommand('gitGraph.toggleBlame');
  const after = vscode.workspace.getConfiguration('gitGraph.blame').get<boolean>('enabled', false);
  assert.notEqual(after, before, 'Blame toggle did not update gitGraph.blame.enabled.');

  await vscode.commands.executeCommand('gitGraph.toggleBlame');
}

async function scenarioMultiRepo(): Promise<void> {
  const repositories = await openGraphAndListRepositories('e9-repos');
  const secondary = findSecondaryRepository(repositories);

  await executeCommand('repository.select', 'e9-select', {
    repositoryId: secondary.id,
  });

  const page = await collectCommitPage('e9-commits', {
    repositoryId: secondary.id,
    limit: 20,
  });
  assert.ok(
    page.commits.some((commit) => commit.subject === 'feat: secondary repository commit'),
    'Secondary repository commit was not returned.',
  );
}

async function scenarioLargeRepo(): Promise<void> {
  const repositories = await openGraphAndListRepositories('e10-repos');
  const secondary = findSecondaryRepository(repositories);
  const totalCommits = 2_500;
  seedSyntheticHistory(secondary.rootPath, totalCommits);

  const seenShas = new Set<string>();
  let cursor: string | undefined;
  let hasMore = true;
  let pageIndex = 0;

  while (hasMore && pageIndex < 10) {
    const page = await collectCommitPage(`e10-page-${pageIndex}`, {
      repositoryId: secondary.id,
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

  assert.ok(seenShas.size >= totalCommits, `Only ${seenShas.size}/${totalCommits} commits paged.`);
  assert.equal(hasMore, false, 'Pagination never reached the end of the synthetic history.');
}

async function openGraphAndListRepositories(requestId: string): Promise<RepositoryDescriptor[]> {
  await vscode.commands.executeCommand('gitGraph.openGraph');
  const state = await vscode.commands.executeCommand<{
    open: boolean;
    repositories: RepositoryDescriptor[];
  }>('gitGraph.__e2e.getPanelState');
  assert.ok(state?.open, 'Git Graph panel did not open.');

  const response = await sendAndWait<{
    requestId?: string;
    repositories: RepositoryDescriptor[];
  }>(
    'repositories.list.request',
    requestId,
    'repositories.list.result',
    { refresh: true },
    (message) =>
      message.id === requestId ||
      (message.payload as { requestId?: string }).requestId === requestId,
    REPOSITORIES_REQUEST_TIMEOUT_MS,
  );
  assert.ok(response.payload.repositories.length > 0, 'No repositories were discovered.');
  return response.payload.repositories;
}

async function collectCommitPage(
  requestId: string,
  payload: Record<string, unknown>,
): Promise<{ commits: CommitSummary[]; cursor?: string; hasMore: boolean }> {
  await executeCommand('commits.page.request', requestId, payload);

  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const chunks = (await getMessages())
      .map((entry) => entry as PostedMessage<CommitsPageChunkPayload>)
      .filter(
        (entry) => entry?.type === 'commits.page.result' && entry.payload?.requestId === requestId,
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
    await delay(25);
  }
  throw new Error(`Timed out waiting for commit page ${requestId}.`);
}

async function sendAndWait<TPayload>(
  type: string,
  id: string,
  responseType: string,
  payload: unknown,
  predicate: (message: PostedMessage<TPayload>) => boolean = () => true,
  timeoutMs = OPERATION_TIMEOUT_MS,
): Promise<PostedMessage<TPayload>> {
  await executeCommand(type, id, payload);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = (await getMessages())
      .map((entry) => entry as PostedMessage<TPayload>)
      .find((entry) => entry?.type === responseType && predicate(entry));
    if (match) {
      return match;
    }
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${responseType} (request ${id}).`);
}

async function executeCommand(type: string, id: string, payload: unknown): Promise<void> {
  await vscode.commands.executeCommand('gitGraph.__e2e.handleWebviewMessage', {
    protocolVersion: 1,
    id,
    type,
    payload,
  });
}

async function getMessages(): Promise<unknown[]> {
  return (
    (await vscode.commands.executeCommand<unknown[]>('gitGraph.__e2e.getPostedMessages')) ?? []
  );
}

async function clearMessages(): Promise<void> {
  await vscode.commands.executeCommand('gitGraph.__e2e.clearPostedMessages');
}

function findPrimaryRepository(repositories: RepositoryDescriptor[]): RepositoryDescriptor {
  const primary = repositories.find((repository) => /primary/.test(repository.rootPath));
  assert.ok(primary, 'Primary repository fixture was not discovered.');
  return primary;
}

function findSecondaryRepository(repositories: RepositoryDescriptor[]): RepositoryDescriptor {
  const secondary = repositories.find((repository) => /secondary/.test(repository.rootPath));
  assert.ok(secondary, 'Secondary repository fixture was not discovered.');
  return secondary;
}

function currentBranch(root: string): string {
  return git(root, ['symbolic-ref', '--short', 'HEAD']).trim();
}

function ensureCleanWorktree(root: string): void {
  git(root, ['reset', '--hard', 'HEAD']);
  git(root, ['clean', '-fd']);
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function seedSyntheticHistory(root: string, count: number): void {
  const lines: string[] = ['blob', 'mark :1', 'data 6', 'hello', '', 'blob', 'mark :2', 'data 12'];
  lines.push('placeholder', '');

  for (let index = 0; index < count; index++) {
    const timestamp = 1_700_000_000 + index * 60;
    const subject = `synthetic commit ${index}`;
    lines.push('commit refs/heads/main');
    lines.push(`mark :${index + 3}`);
    lines.push(`author Host E2E Bot <host@gitgraph.test> ${timestamp} +0000`);
    lines.push(`committer Host E2E Bot <host@gitgraph.test> ${timestamp} +0000`);
    lines.push(`data ${Buffer.byteLength(subject, 'utf8')}`);
    lines.push(subject);
    if (index > 0) {
      lines.push(`from :${index + 2}`);
    }
    lines.push('M 100644 :2 history.txt');
    lines.push('');
  }

  execFileSync('git', ['fast-import', '--quiet', '--force'], {
    cwd: root,
    input: `${lines.join('\n')}\n`,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  git(root, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  git(root, ['reset', '--hard', '--quiet']);
}

function formatFailure(payload: OperationResultPayload): string {
  return payload.error?.message ?? `Operation ${payload.requestId} failed.`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
