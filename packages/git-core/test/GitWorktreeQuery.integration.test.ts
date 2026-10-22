import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GitWorktreeInfoSchema } from '@git-graph/shared';
import { GitCliClient, GitWorktreeQuery } from '../src/index';

describe('GitWorktreeQuery - Integration with real Git', () => {
  let client: GitCliClient;
  let tempRoot: string;
  let repoPath: string;
  let query: GitWorktreeQuery;

  beforeAll(async () => {
    const info = await GitCliClient.detect();
    client = new GitCliClient(info.path);
    query = new GitWorktreeQuery({ client });

    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-git-worktree-int-'));
    repoPath = path.join(tempRoot, 'main');
    await client.exec(['init', '-b', 'main', repoPath]);
    await client.exec(['config', 'user.name', 'Worktree Tester'], { cwd: repoPath });
    await client.exec(['config', 'user.email', 'worktree@example.com'], { cwd: repoPath });
    await client.exec(['config', 'commit.gpgsign', 'false'], { cwd: repoPath });

    fs.writeFileSync(path.join(repoPath, 'tracked.txt'), 'one\n');
    await client.exec(['add', '.'], { cwd: repoPath });
    await client.exec(['commit', '-m', 'initial commit'], { cwd: repoPath });
    await client.exec(['branch', 'feature'], { cwd: repoPath });
  });

  afterAll(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('lists, adds, and removes linked worktrees', async () => {
    const initial = await query.list(repoPath);
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({
      path: fs.realpathSync(repoPath),
      branch: 'main',
      isCurrent: true,
    });
    expect(GitWorktreeInfoSchema.safeParse(initial[0]).success).toBe(true);

    const linkedPath = path.join(tempRoot, 'linked');
    const added = await query.add(repoPath, {
      path: linkedPath,
      branch: 'feature',
      newBranch: 'feature-linked',
    });

    expect(added).toHaveLength(2);
    const linked = added.find((worktree) => worktree.path === fs.realpathSync(linkedPath));
    expect(linked).toMatchObject({ branch: 'feature-linked' });
    expect(linked?.isCurrent).toBeUndefined();
    expect(fs.existsSync(linkedPath)).toBe(true);

    await query.remove(repoPath, linkedPath);
    const remaining = await query.list(repoPath);
    expect(remaining).toHaveLength(1);
    expect(fs.existsSync(linkedPath)).toBe(false);
  });
});
