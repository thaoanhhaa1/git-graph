import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GitCliClient, GitRepository } from '@git-graph/git-core';
import { GitOperationService } from '../../apps/extension/src/operations/GitOperationService';
import { RepositoryManager } from '../../apps/extension/src/repositories/RepositoryManager';
import { RefreshCoordinator } from '../../apps/extension/src/application/RefreshCoordinator';

describe('Phase 2: Working tree & stash integration with a real repository', () => {
  let tempRepoDir: string;
  let client: GitCliClient;
  let repo: GitRepository;
  let repositoryManager: RepositoryManager;
  let refreshCoordinator: RefreshCoordinator;
  let service: GitOperationService;

  beforeEach(async () => {
    const info = await GitCliClient.detect();
    client = new GitCliClient(info.path);
    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-phase2-int-'));

    await client.exec(['init', '-b', 'main', tempRepoDir]);
    await client.exec(['config', 'user.name', 'Phase Two Runner'], { cwd: tempRepoDir });
    await client.exec(['config', 'user.email', 'phase2@gitgraph.test'], { cwd: tempRepoDir });
    await client.exec(['config', 'commit.gpgsign', 'false'], { cwd: tempRepoDir });

    fs.writeFileSync(path.join(tempRepoDir, 'README.md'), 'initial\n');
    await client.exec(['add', '.'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'chore: initial commit'], { cwd: tempRepoDir });

    const opened = await GitRepository.open(tempRepoDir, { client });
    if (!opened) {
      throw new Error(`Failed to open GitRepository at ${tempRepoDir}`);
    }
    repo = opened;

    repositoryManager = new RepositoryManager();
    vi.spyOn(repositoryManager, 'getRepository').mockImplementation((id: string) =>
      id === repo.id ? repo : undefined,
    );
    refreshCoordinator = new RefreshCoordinator();
    service = new GitOperationService({
      repositoryManager,
      refreshCoordinator,
      logger: () => {},
    });
  });

  afterEach(() => {
    if (tempRepoDir && fs.existsSync(tempRepoDir)) {
      fs.rmSync(tempRepoDir, { recursive: true, force: true });
    }
  });

  it('stages two files, commits, and invalidates the graph with the new commit visible', async () => {
    fs.writeFileSync(path.join(tempRepoDir, 'first.txt'), 'first\n');
    fs.writeFileSync(path.join(tempRepoDir, 'second.txt'), 'second\n');
    fs.appendFileSync(path.join(tempRepoDir, 'README.md'), 'changed\n');

    const invalidateSpy = vi.spyOn(refreshCoordinator, 'invalidate');

    const staged = await service.stageWorktree({
      operationId: 'stage-2',
      repositoryId: repo.id,
      paths: ['first.txt', 'second.txt'],
    });
    expect(staged.success).toBe(true);

    let status = await repo.getWorktreeStatus();
    expect(status.staged.map((f) => f.path).sort()).toEqual(['first.txt', 'second.txt']);

    const commitResult = await service.createCommit({
      operationId: 'commit-2',
      repositoryId: repo.id,
      message: 'feat: add two files',
      description: 'Integration commit body',
    });

    expect(commitResult.success).toBe(true);
    expect(commitResult.data?.subject).toBe('feat: add two files');
    expect(invalidateSpy).toHaveBeenCalledWith(repo.id, 'operation-commit-create');

    status = await repo.getWorktreeStatus();
    expect(status.staged).toHaveLength(0);
    expect(status.unstaged.map((f) => f.path)).toEqual(['README.md']);

    const page = await repo.getCommits({ limit: 10 });
    expect(page.commits[0]?.subject).toBe('feat: add two files');
    expect(page.commits[0]?.sha).toBe(commitResult.data?.sha);

    const body = await repo.getCommitBody(commitResult.data!.sha);
    expect(body).toContain('Integration commit body');
  });

  it('saves a stash from a dirty repository, then applies and drops it safely', async () => {
    fs.appendFileSync(path.join(tempRepoDir, 'README.md'), 'stashed change\n');
    fs.writeFileSync(path.join(tempRepoDir, 'untracked.txt'), 'untracked\n');

    const saved = await service.saveStash({
      operationId: 'stash-save-1',
      repositoryId: repo.id,
      message: 'phase 2 stash',
      includeUntracked: true,
    });
    expect(saved.success).toBe(true);

    expect((await repo.getWorktreeStatus()).isClean).toBe(true);

    let stashes = await repo.listStashes();
    expect(stashes).toHaveLength(1);
    expect(stashes[0]?.message).toContain('phase 2 stash');

    const applied = await service.applyStash({
      operationId: 'stash-apply-1',
      repositoryId: repo.id,
      index: 0,
    });
    expect(applied.success).toBe(true);
    expect(fs.existsSync(path.join(tempRepoDir, 'untracked.txt'))).toBe(true);
    expect(await repo.listStashes()).toHaveLength(1);

    const dropped = await service.dropStash({
      operationId: 'stash-drop-1',
      repositoryId: repo.id,
      index: 0,
    });
    expect(dropped.success).toBe(true);
    stashes = await repo.listStashes();
    expect(stashes).toHaveLength(0);
  });

  it('discards tracked and untracked changes without touching committed files', async () => {
    fs.appendFileSync(path.join(tempRepoDir, 'README.md'), 'discard me\n');
    fs.writeFileSync(path.join(tempRepoDir, 'scratch.txt'), 'scratch\n');

    const discarded = await service.discardWorktree({
      operationId: 'discard-1',
      repositoryId: repo.id,
      paths: ['README.md', 'scratch.txt'],
    });
    expect(discarded.success).toBe(true);

    expect((await repo.getWorktreeStatus()).isClean).toBe(true);
    expect(fs.existsSync(path.join(tempRepoDir, 'scratch.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(tempRepoDir, 'README.md'), 'utf8')).toBe('initial\n');
  });
});
