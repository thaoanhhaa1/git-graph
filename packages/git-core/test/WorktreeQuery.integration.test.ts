import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WorktreeStatusSchema, StashEntrySchema } from '@git-graph/shared';
import { GitCliClient, GitRepository, WorktreeQuery, StashQuery } from '../src/index';

describe('WorktreeQuery & StashQuery - Integration with real Git', () => {
  let client: GitCliClient;
  let tempRepoDir: string;
  let worktreeQuery: WorktreeQuery;
  let stashQuery: StashQuery;
  let repo: GitRepository;

  beforeAll(async () => {
    const info = await GitCliClient.detect();
    client = new GitCliClient(info.path);
    worktreeQuery = new WorktreeQuery({ client });
    stashQuery = new StashQuery({ client });

    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-worktree-int-'));
    await client.exec(['init', '-b', 'main', tempRepoDir]);
    await client.exec(['config', 'user.name', 'Worktree Tester'], { cwd: tempRepoDir });
    await client.exec(['config', 'user.email', 'worktree@example.com'], { cwd: tempRepoDir });
    await client.exec(['config', 'commit.gpgsign', 'false'], { cwd: tempRepoDir });

    fs.writeFileSync(path.join(tempRepoDir, 'tracked.txt'), 'one\n');
    await client.exec(['add', '.'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'initial commit'], { cwd: tempRepoDir });

    repo = new GitRepository(
      {
        id: 'repo-1',
        rootPath: tempRepoDir,
        name: 'repo',
        gitDir: path.join(tempRepoDir, '.git'),
        isBare: false,
      },
      { client },
    );
  });

  afterAll(() => {
    fs.rmSync(tempRepoDir, { recursive: true, force: true });
  });

  it('reports a clean worktree with head metadata', async () => {
    const status = await worktreeQuery.getStatus(tempRepoDir);

    expect(status.isClean).toBe(true);
    expect(status.hasConflicts).toBe(false);
    expect(status.currentBranch).toBe('main');
    expect(status.head?.subject).toBe('initial commit');
    expect(WorktreeStatusSchema.safeParse(status).success).toBe(true);
  });

  it('reports staged, unstaged, and untracked files separately', async () => {
    fs.appendFileSync(path.join(tempRepoDir, 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(tempRepoDir, 'untracked.txt'), 'new\n');
    await client.exec(['add', 'tracked.txt'], { cwd: tempRepoDir });

    const status = await worktreeQuery.getStatus(tempRepoDir);

    expect(status.isClean).toBe(false);
    expect(status.staged.map((f) => f.path)).toEqual(['tracked.txt']);
    expect(status.unstaged.map((f) => f.path)).toContain('untracked.txt');
    expect(WorktreeStatusSchema.safeParse(status).success).toBe(true);
  });

  it('unstages files and discards both tracked and untracked changes', async () => {
    await worktreeQuery.unstage(tempRepoDir, ['tracked.txt']);
    let status = await worktreeQuery.getStatus(tempRepoDir);
    expect(status.staged).toHaveLength(0);
    expect(status.unstaged.map((f) => f.path)).toContain('tracked.txt');

    await worktreeQuery.discard(tempRepoDir, {
      paths: ['tracked.txt', 'untracked.txt'],
    });
    status = await worktreeQuery.getStatus(tempRepoDir);
    expect(status.isClean).toBe(true);
    expect(fs.existsSync(path.join(tempRepoDir, 'untracked.txt'))).toBe(false);
  });

  it('creates a commit from staged changes', async () => {
    fs.writeFileSync(path.join(tempRepoDir, 'committed.txt'), 'content\n');
    await worktreeQuery.stage(tempRepoDir, ['committed.txt']);

    const result = await worktreeQuery.commit(tempRepoDir, {
      message: 'feat: add committed file',
      description: 'Body text',
    });

    expect(result.subject).toBe('feat: add committed file');
    expect(result.sha).toMatch(/^[0-9a-f]{40}$/);
    expect((await worktreeQuery.getStatus(tempRepoDir)).isClean).toBe(true);

    const body = await client.exec(['log', '-1', '--format=%B'], { cwd: tempRepoDir });
    expect(body.stdout).toContain('Body text');
  });

  it('saves, applies, pops, and drops stashes', async () => {
    fs.appendFileSync(path.join(tempRepoDir, 'tracked.txt'), 'stash me\n');
    fs.writeFileSync(path.join(tempRepoDir, 'stash-untracked.txt'), 'u\n');

    await stashQuery.save(tempRepoDir, {
      message: 'work in progress',
      includeUntracked: true,
    });

    let stashes = await stashQuery.list(tempRepoDir);
    expect(stashes).toHaveLength(1);
    expect(stashes[0]?.message).toBe('On main: work in progress');
    expect(StashEntrySchema.safeParse(stashes[0]).success).toBe(true);
    expect((await worktreeQuery.getStatus(tempRepoDir)).isClean).toBe(true);

    await stashQuery.apply(tempRepoDir, 0);
    expect(fs.existsSync(path.join(tempRepoDir, 'stash-untracked.txt'))).toBe(true);
    expect(await stashQuery.list(tempRepoDir)).toHaveLength(1);

    await stashQuery.drop(tempRepoDir, 0);
    stashes = await stashQuery.list(tempRepoDir);
    expect(stashes).toHaveLength(0);

    fs.appendFileSync(path.join(tempRepoDir, 'tracked.txt'), 'again\n');
    await stashQuery.save(tempRepoDir, { message: 'second' });
    await stashQuery.pop(tempRepoDir, 0);
    expect(await stashQuery.list(tempRepoDir)).toHaveLength(0);

    await worktreeQuery.discard(tempRepoDir, { paths: [], all: true });
    expect((await worktreeQuery.getStatus(tempRepoDir)).isClean).toBe(true);
  });

  it('exposes worktree and stash operations via GitRepository', async () => {
    fs.writeFileSync(path.join(tempRepoDir, 'via-repo.txt'), 'x\n');

    const status = await repo.getWorktreeStatus();
    expect(status.unstaged.map((f) => f.path)).toContain('via-repo.txt');

    await repo.stageWorktree(['via-repo.txt']);
    expect((await repo.getWorktreeStatus()).staged.map((f) => f.path)).toContain('via-repo.txt');

    await repo.unstageWorktree(['via-repo.txt']);
    await repo.discardWorktree({ paths: ['via-repo.txt'] });
    expect((await repo.getWorktreeStatus()).isClean).toBe(true);
  });
});
