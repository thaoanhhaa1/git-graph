import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitCliClient, GitRepository, RefQuery } from '../src/index';

describe('RefQuery & GitRepository - Integration with real Git', () => {
  let client: GitCliClient;
  let tempRepoDir: string;
  let refQuery: RefQuery;
  let repo: GitRepository;
  let commit1Sha: string;
  let commit2Sha: string;

  beforeAll(async () => {
    const info = await GitCliClient.detect();
    client = new GitCliClient(info.path);
    refQuery = new RefQuery({ client });

    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-ref-int-'));

    // 1. Init repository on branch main
    await client.exec(['init', '-b', 'main', tempRepoDir]);
    await client.exec(['config', 'user.name', 'Ref Tester'], { cwd: tempRepoDir });
    await client.exec(['config', 'user.email', 'ref-tester@example.com'], { cwd: tempRepoDir });
    await client.exec(['config', 'commit.gpgsign', 'false'], { cwd: tempRepoDir });

    // 2. Commit 1 on main
    fs.writeFileSync(path.join(tempRepoDir, 'file1.txt'), 'Hello Ref 1\n');
    await client.exec(['add', 'file1.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'chore: commit 1'], { cwd: tempRepoDir });
    const res1 = await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir });
    commit1Sha = res1.stdout.trim();

    // 3. Create lightweight tag
    await client.exec(['tag', 'v0.1.0-light', commit1Sha], { cwd: tempRepoDir });

    // 4. Create annotated tag
    await client.exec(
      ['tag', '-a', 'v0.1.0-annotated', '-m', 'Release 0.1 annotated tag', commit1Sha],
      {
        cwd: tempRepoDir,
      },
    );

    // 5. Create feature branch and commit 2
    await client.exec(['checkout', '-b', 'feature-login'], { cwd: tempRepoDir });
    fs.writeFileSync(path.join(tempRepoDir, 'file2.txt'), 'Hello Feature\n');
    await client.exec(['add', 'file2.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'feat: login feature'], { cwd: tempRepoDir });
    const res2 = await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir });
    commit2Sha = res2.stdout.trim();

    // 6. Switch back to main
    await client.exec(['checkout', 'main'], { cwd: tempRepoDir });

    const opened = await GitRepository.open(tempRepoDir, { client });
    expect(opened).not.toBeNull();
    repo = opened!;
  });

  afterAll(() => {
    try {
      fs.rmSync(tempRepoDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('correctly reads local branches and current HEAD branch', async () => {
    const result = await refQuery.queryRefs(tempRepoDir);

    expect(result.isDetachedHead).toBe(false);
    expect(result.currentBranch).toBe('main');
    expect(result.head?.target).toBe(commit1Sha);

    expect(result.localBranches).toHaveLength(2);

    const mainBranch = result.localBranches.find((b) => b.name === 'main');
    expect(mainBranch).toBeDefined();
    expect(mainBranch?.isCurrent).toBe(true);
    expect(mainBranch?.target).toBe(commit1Sha);

    const featBranch = result.localBranches.find((b) => b.name === 'feature-login');
    expect(featBranch).toBeDefined();
    expect(featBranch?.isCurrent).toBeUndefined();
    expect(featBranch?.target).toBe(commit2Sha);
  });

  it('distinguishes between lightweight tag and annotated tag with peeled SHA', async () => {
    const result = await refQuery.queryRefs(tempRepoDir);

    const lightTag = result.tags.find((t) => t.name === 'v0.1.0-light');
    expect(lightTag).toBeDefined();
    expect(lightTag?.kind).toBe('tag');
    expect(lightTag?.tagType).toBe('lightweight');
    expect(lightTag?.target).toBe(commit1Sha);
    expect(lightTag?.tagObjectSha).toBeUndefined();

    const annotTag = result.tags.find((t) => t.name === 'v0.1.0-annotated');
    expect(annotTag).toBeDefined();
    expect(annotTag?.kind).toBe('tag');
    expect(annotTag?.tagType).toBe('annotated');
    // Target must be the peeled commit SHA, not the tag object SHA
    expect(annotTag?.target).toBe(commit1Sha);
    // tagObjectSha must be present and distinct from commit SHA
    expect(annotTag?.tagObjectSha).toBeDefined();
    expect(annotTag?.tagObjectSha).not.toBe(commit1Sha);
  });

  it('correctly reports detached HEAD state and HEAD ref', async () => {
    // Checkout commit 1 directly (detached HEAD)
    await client.exec(['checkout', '--detach', commit1Sha], { cwd: tempRepoDir });

    const result = await refQuery.queryRefs(tempRepoDir);

    expect(result.isDetachedHead).toBe(true);
    expect(result.currentBranch).toBeUndefined();
    expect(result.head).toBeDefined();
    expect(result.head?.name).toBe('HEAD');
    expect(result.head?.target).toBe(commit1Sha);
    expect(result.head?.kind).toBe('head');

    // Switch back to main for subsequent tests
    await client.exec(['checkout', 'main'], { cwd: tempRepoDir });
  });

  it('integrates seamlessly with GitRepository instance', async () => {
    const refs = await repo.getRefs();
    expect(refs.localBranches).toHaveLength(2);
    expect(refs.tags).toHaveLength(2);

    const branches = await repo.getBranches();
    expect(branches).toHaveLength(2);

    const localBranches = await repo.getLocalBranches();
    expect(localBranches).toHaveLength(2);

    const tags = await repo.getTags();
    expect(tags).toHaveLength(2);

    const head = await repo.getHead();
    expect(head?.name).toBe('HEAD');
    expect(head?.target).toBe(commit1Sha);
  });
});
