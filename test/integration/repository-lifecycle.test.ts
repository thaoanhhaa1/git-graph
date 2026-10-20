import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GitCliClient, GitRepository } from '@git-graph/git-core';
import { buildCommitGraph } from '@git-graph/git-graph';
import { GitOperationService } from '../../apps/extension/src/operations/GitOperationService';
import { RepositoryManager } from '../../apps/extension/src/repositories/RepositoryManager';
import { RefreshCoordinator } from '../../apps/extension/src/application/RefreshCoordinator';

describe('Milestone 7.2: Repository Integration Tests with Real Temporary Git Repositories', () => {
  let tempRepoDir: string;
  let client: GitCliClient;
  let repo: GitRepository;

  beforeEach(async () => {
    const info = await GitCliClient.detect();
    client = new GitCliClient(info.path);
    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-m7-int-'));

    await client.exec(['init', tempRepoDir]);
    await client.exec(['config', 'user.name', 'Integration Test Runner'], { cwd: tempRepoDir });
    await client.exec(['config', 'user.email', 'integration@gitgraph.test'], { cwd: tempRepoDir });
    await client.exec(['config', 'commit.gpgsign', 'false'], { cwd: tempRepoDir });

    const openRepo = await GitRepository.open(tempRepoDir, { client });
    if (!openRepo) {
      throw new Error(`Failed to open GitRepository at ${tempRepoDir}`);
    }
    repo = openRepo;
  });

  afterEach(() => {
    if (tempRepoDir && fs.existsSync(tempRepoDir)) {
      try {
        fs.rmSync(tempRepoDir, { recursive: true, force: true });
      } catch {
        tempRepoDir = '';
      }
    }
  });

  it('verifies linear commit history, author parsing, body, and graph reconstruction', async () => {
    const fileA = path.join(tempRepoDir, 'fileA.txt');
    fs.writeFileSync(fileA, 'Line 1\nLine 2\n', 'utf-8');
    await client.exec(['add', 'fileA.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'feat: add fileA\n\nDetailed description of fileA.'], {
      cwd: tempRepoDir,
    });

    fs.appendFileSync(fileA, 'Line 3\n', 'utf-8');
    await client.exec(['add', 'fileA.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'feat: update fileA'], { cwd: tempRepoDir });

    const commitsPage = await repo.getCommits({ limit: 10 });
    expect(commitsPage.commits.length).toBe(2);

    const latest = commitsPage.commits[0]!;
    const initial = commitsPage.commits[1]!;

    expect(latest.subject).toBe('feat: update fileA');
    expect(latest.parents).toEqual([initial.sha]);
    expect(initial.subject).toBe('feat: add fileA');

    const initialBody = await repo.getCommitBody(initial.sha);
    expect(initialBody).toContain('Detailed description of fileA.');

    const graphRows = buildCommitGraph(commitsPage.commits);
    expect(graphRows.length).toBe(2);
    expect(graphRows[0]?.lane).toBe(0);
    expect(graphRows[1]?.lane).toBe(0);
  });

  it('verifies branch creation, diverging commits, and merge commit topology', async () => {
    const mainFile = path.join(tempRepoDir, 'main.txt');
    fs.writeFileSync(mainFile, 'Initial main content\n', 'utf-8');
    await client.exec(['add', 'main.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'initial commit on main'], { cwd: tempRepoDir });

    await client.exec(['checkout', '-b', 'feature-1'], { cwd: tempRepoDir });
    const featureFile = path.join(tempRepoDir, 'feature.txt');
    fs.writeFileSync(featureFile, 'Feature code\n', 'utf-8');
    await client.exec(['add', 'feature.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'feat: commit on feature-1'], { cwd: tempRepoDir });

    await client.exec(['checkout', 'master'], { cwd: tempRepoDir }).catch(async () => {
      await client.exec(['checkout', 'main'], { cwd: tempRepoDir });
    });
    fs.appendFileSync(mainFile, 'Second line on main branch\n', 'utf-8');
    await client.exec(['add', 'main.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'chore: update main branch'], { cwd: tempRepoDir });

    await client.exec(['merge', '--no-ff', '-m', 'Merge branch feature-1', 'feature-1'], {
      cwd: tempRepoDir,
    });

    const commitsPage = await repo.getCommits({ limit: 10 });
    expect(commitsPage.commits.length).toBe(4);

    const mergeCommit = commitsPage.commits[0]!;
    expect(mergeCommit.subject).toBe('Merge branch feature-1');
    expect(mergeCommit.parents.length).toBe(2);

    const graph = buildCommitGraph(commitsPage.commits);
    expect(graph.length).toBe(4);
    expect(graph[0]?.commit.parents.length).toBe(2);

    const refs = await repo.getRefs();
    const branchNames = refs.localBranches.map((b) => b.name);
    expect(branchNames).toContain('feature-1');
  });

  it('verifies lightweight and annotated tags parsing and attachment', async () => {
    const docFile = path.join(tempRepoDir, 'docs.md');
    fs.writeFileSync(docFile, '# Docs\n', 'utf-8');
    await client.exec(['add', 'docs.md'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'docs: create documentation'], { cwd: tempRepoDir });

    await client.exec(['tag', 'v0.1.0-lightweight'], { cwd: tempRepoDir });

    await client.exec(['tag', '-a', 'v0.2.0-annotated', '-m', 'Release 0.2.0 notes'], {
      cwd: tempRepoDir,
    });

    const refs = await repo.getRefs();
    const tagMap = new Map(refs.tags.map((t) => [t.name, t]));

    const lightTag = tagMap.get('v0.1.0-lightweight');
    const annTag = tagMap.get('v0.2.0-annotated');

    expect(lightTag).toBeDefined();
    expect(lightTag?.tagType).toBe('lightweight');

    expect(annTag).toBeDefined();
    expect(annTag?.tagType).toBe('annotated');

    const commitPage = await repo.getCommits();
    const graph = buildCommitGraph(commitPage.commits, {
      externalRefs: refs.tags,
    });

    const targetCommit = graph[0]?.commit;
    expect(targetCommit?.refs.some((r) => r.name === 'v0.1.0-lightweight')).toBe(true);
    expect(targetCommit?.refs.some((r) => r.name === 'v0.2.0-annotated')).toBe(true);
  });

  it('verifies file rename and binary file diff parser integration', async () => {
    const oldFile = path.join(tempRepoDir, 'legacy_name.txt');
    fs.writeFileSync(oldFile, 'Line 1 for rename\nLine 2 for rename\n', 'utf-8');
    await client.exec(['add', 'legacy_name.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'initial file before rename'], { cwd: tempRepoDir });

    const newFile = path.join(tempRepoDir, 'renamed_module.txt');
    fs.renameSync(oldFile, newFile);
    await client.exec(['add', '-A'], { cwd: tempRepoDir });

    const binaryFile = path.join(tempRepoDir, 'logo.png');
    const binBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x00, 0x42,
    ]);
    fs.writeFileSync(binaryFile, binBuffer);
    await client.exec(['add', 'logo.png'], { cwd: tempRepoDir });

    await client.exec(['commit', '-m', 'feat: rename file and add binary asset'], {
      cwd: tempRepoDir,
    });

    const commitPage = await repo.getCommits({ limit: 1 });
    const latestSha = commitPage.commits[0]!.sha;

    const details = await repo.getCommitDetailsWithStats(latestSha);
    expect(details).not.toBeNull();
    if (!details) return;

    const renamedChange = details.fileChanges.find(
      (f) => f.path === 'renamed_module.txt' || f.status === 'renamed',
    );
    expect(renamedChange).toBeDefined();
    expect(renamedChange?.oldPath).toBe('legacy_name.txt');

    const binaryChange = details.fileChanges.find((f) => f.path === 'logo.png');
    expect(binaryChange).toBeDefined();
    expect(binaryChange?.isBinary).toBe(true);

    const diffRes = await repo.getDiff({
      sha: latestSha,
      filePath: 'logo.png',
    });
    expect(diffRes.isBinary).toBe(true);
  });

  it('verifies dirty worktree detection and preflight guard in GitOperationService', async () => {
    const testDoc = path.join(tempRepoDir, 'workspace.txt');
    fs.writeFileSync(testDoc, 'Committed content\n', 'utf-8');
    await client.exec(['add', 'workspace.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'chore: commit workspace doc'], { cwd: tempRepoDir });

    await client.exec(['branch', 'dev'], { cwd: tempRepoDir });

    fs.appendFileSync(testDoc, 'Dirty uncommitted line\n', 'utf-8');

    const repoManager = new RepositoryManager();
    const refreshCoordinator = new RefreshCoordinator();
    const service = new GitOperationService({
      repositoryManager: repoManager,
      refreshCoordinator,
    });

    vi.spyOn(repoManager, 'getRepository').mockImplementation((repositoryId: string) =>
      repositoryId === repo.id ? repo : undefined,
    );

    const checkoutResult = await service.checkout({
      repositoryId: repo.id,
      target: 'dev',
      targetType: 'localBranch',
    });

    expect(checkoutResult.success).toBe(false);
    expect(checkoutResult.error).toBeDefined();
    expect(checkoutResult.actionableMessage).toContain('uncommitted changes');

    await client.exec(['checkout', '--', '.'], { cwd: tempRepoDir });

    const retryCheckout = await service.checkout({
      repositoryId: repo.id,
      target: 'dev',
      targetType: 'localBranch',
    });

    expect(retryCheckout.success).toBe(true);
    expect(retryCheckout.data?.checkedOutRef).toBe('refs/heads/dev');

    const refs = await repo.getRefs();
    expect(refs.currentBranch).toBe('dev');
  });

  it('verifies guarded rebase and rebase conflict abort in GitOperationService', async () => {
    const sharedFile = path.join(tempRepoDir, 'shared.txt');
    fs.writeFileSync(sharedFile, 'base\n', 'utf-8');
    await client.exec(['add', 'shared.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'base commit'], { cwd: tempRepoDir });

    await client.exec(['checkout', '-b', 'feature'], { cwd: tempRepoDir });
    fs.writeFileSync(sharedFile, 'feature change\n', 'utf-8');
    await client.exec(['add', 'shared.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'feature change'], { cwd: tempRepoDir });
    await client.exec(['config', 'branch.feature.remote', '.'], { cwd: tempRepoDir });
    await client.exec(['config', 'branch.feature.merge', 'refs/heads/feature'], {
      cwd: tempRepoDir,
    });

    await client.exec(['checkout', 'master'], { cwd: tempRepoDir }).catch(async () => {
      await client.exec(['checkout', 'main'], { cwd: tempRepoDir });
    });
    fs.writeFileSync(sharedFile, 'main change\n', 'utf-8');
    await client.exec(['add', 'shared.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'main change'], { cwd: tempRepoDir });

    const mainSha = (await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir })).stdout.trim();
    await client.exec(['checkout', 'feature'], { cwd: tempRepoDir });

    const repoManager = new RepositoryManager();
    const refreshCoordinator = new RefreshCoordinator();
    const service = new GitOperationService({
      repositoryManager: repoManager,
      refreshCoordinator,
    });

    vi.spyOn(repoManager, 'getRepository').mockImplementation((repositoryId: string) =>
      repositoryId === repo.id ? repo : undefined,
    );

    const unconfirmedResult = await service.rebase({
      repositoryId: repo.id,
      target: mainSha,
    });

    expect(unconfirmedResult.success).toBe(false);
    expect(unconfirmedResult.actionableMessage).toContain('Confirm before rebasing');

    const conflictResult = await service.rebase({
      repositoryId: repo.id,
      target: mainSha,
      confirmedPublishedBranch: true,
    });

    expect(conflictResult.success).toBe(false);
    expect(conflictResult.actionableMessage).toContain('Rebase stopped with conflicts');
    expect(conflictResult.error?.details).toMatchObject({
      rebaseState: {
        inProgress: true,
        unmergedFiles: ['shared.txt'],
      },
    });

    const abortResult = await service.abortRebase({
      repositoryId: repo.id,
    });

    expect(abortResult.success).toBe(true);
    expect(abortResult.data?.action).toBe('abort');
    expect(abortResult.data?.rebaseState.inProgress).toBe(false);
  });
});
