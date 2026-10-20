import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CommitSchema, CommitPageSchema } from '@git-graph/shared';
import { GitCliClient, GitRepository, CommitQuery } from '../src/index';

describe('CommitQuery & GitRepository - Integration with real Git', () => {
  let client: GitCliClient;
  let tempRepoDir: string;
  let repo: GitRepository;
  let query: CommitQuery;
  let rootSha: string;
  let featSha: string;
  let mergeSha: string;

  beforeAll(async () => {
    const info = await GitCliClient.detect();
    client = new GitCliClient(info.path);
    query = new CommitQuery({ client });

    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-commit-int-'));

    // 1. Init repository with branch main
    await client.exec(['init', '-b', 'main', tempRepoDir]);
    await client.exec(['config', 'user.name', 'Integration Tester'], { cwd: tempRepoDir });
    await client.exec(['config', 'user.email', 'int-tester@example.com'], { cwd: tempRepoDir });
    await client.exec(['config', 'commit.gpgsign', 'false'], { cwd: tempRepoDir });

    // 2. Create root commit
    const file1 = path.join(tempRepoDir, 'file1.txt');
    fs.writeFileSync(file1, 'Hello World\n');
    await client.exec(['add', 'file1.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'feat: initial root commit\n\nFull body of root commit.'], {
      cwd: tempRepoDir,
    });
    const rootRes = await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir });
    rootSha = rootRes.stdout.trim();

    // 3. Create a tag on root commit
    await client.exec(['tag', 'v0.1.0', rootSha], { cwd: tempRepoDir });

    // 4. Create branch feature-x and commit
    await client.exec(['checkout', '-b', 'feature-x'], { cwd: tempRepoDir });
    const file2 = path.join(tempRepoDir, 'feature.txt');
    fs.writeFileSync(file2, 'Feature X\n');
    await client.exec(['add', 'feature.txt'], { cwd: tempRepoDir });
    await client.exec(
      ['commit', '-m', 'feat: add feature X\n\nDetailed feature X multiline\ndescription.'],
      { cwd: tempRepoDir },
    );
    const featRes = await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir });
    featSha = featRes.stdout.trim();

    // 5. Checkout main and create another commit on main
    await client.exec(['checkout', 'main'], { cwd: tempRepoDir });
    const file3 = path.join(tempRepoDir, 'main-update.txt');
    fs.writeFileSync(file3, 'Main update\n');
    await client.exec(['add', 'main-update.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'docs: update main branch docs'], { cwd: tempRepoDir });

    // 6. Merge feature-x into main
    await client.exec(
      ['merge', '--no-ff', 'feature-x', '-m', "merge: merge 'feature-x' into main"],
      { cwd: tempRepoDir },
    );
    const mergeRes = await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir });
    mergeSha = mergeRes.stdout.trim();

    // 7. Open GitRepository instance
    const openedRepo = await GitRepository.open(tempRepoDir, { client });
    if (!openedRepo) {
      throw new Error('Failed to open GitRepository in integration test');
    }
    repo = openedRepo;
  });

  afterAll(() => {
    if (tempRepoDir && fs.existsSync(tempRepoDir)) {
      try {
        fs.rmSync(tempRepoDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('queries all commits and correctly parses root commit, merge commit, and parent SHAs', async () => {
    const page = await repo.getCommits({ limit: 10 });
    expect(page.commits.length).toBeGreaterThanOrEqual(4);
    expect(page.hasMore).toBe(false);

    // Validate Zod schema
    expect(() => CommitPageSchema.parse(page)).not.toThrow();

    // Verify Merge commit
    const mergeCommit = page.commits.find((c) => c.sha === mergeSha);
    expect(mergeCommit).toBeDefined();
    expect(mergeCommit?.parents).toHaveLength(2);

    // Verify Root commit
    const rootCommit = page.commits.find((c) => c.sha === rootSha);
    expect(rootCommit).toBeDefined();
    expect(rootCommit?.parents).toEqual([]);

    // Check author info
    expect(rootCommit?.author.name).toBe('Integration Tester');
    expect(rootCommit?.author.email).toBe('int-tester@example.com');
    expect(rootCommit?.author.timestamp).toBeGreaterThan(0);
  });

  it('correctly parses decorations (HEAD, branches, tags)', async () => {
    const page = await repo.getCommits();

    const rootCommit = page.commits.find((c) => c.sha === rootSha);
    const tagRef = rootCommit?.refs.find((r) => r.kind === 'tag');
    expect(tagRef).toBeDefined();
    expect(tagRef?.name).toBe('v0.1.0');
    expect(tagRef?.fullName).toBe('refs/tags/v0.1.0');

    const mergeCommit = page.commits.find((c) => c.sha === mergeSha);
    const headRef = mergeCommit?.refs.find((r) => r.kind === 'head');
    expect(headRef).toBeDefined();
    expect(headRef?.isCurrent).toBe(true);

    const mainBranchRef = mergeCommit?.refs.find(
      (r) => r.kind === 'localBranch' && r.name === 'main',
    );
    expect(mainBranchRef).toBeDefined();
  });

  it('supports pagination with limit and cursor', async () => {
    // Page 1 with limit 2
    const page1 = await repo.getCommits({ limit: 2 });
    expect(page1.commits).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.cursor).toBe('2');

    // Page 2 with limit 2
    const page2 = await repo.getCommits({ limit: 2, cursor: page1.cursor });
    expect(page2.commits.length).toBeGreaterThanOrEqual(2);

    // Ensure distinct commits between page 1 and page 2
    const shas1 = new Set(page1.commits.map((c) => c.sha));
    for (const c of page2.commits) {
      expect(shas1.has(c.sha)).toBe(false);
    }
  });

  it('filters commits by specific ref', async () => {
    const featurePage = await repo.getCommits({ ref: 'feature-x' });
    const featureShas = featurePage.commits.map((c) => c.sha);

    expect(featureShas).toContain(featSha);
    expect(featureShas).toContain(rootSha);
    expect(featureShas).not.toContain(mergeSha);
  });

  it('queries commit details with full body and commit diff', async () => {
    const details = await repo.getCommitDetails(featSha);
    expect(details).not.toBeNull();
    expect(details?.sha).toBe(featSha);
    expect(details?.body).toContain('Detailed feature X multiline');

    expect(() => CommitSchema.parse(details)).not.toThrow();

    const diff = await repo.getCommitDiff(featSha);
    expect(diff).toContain('+Feature X');
  });

  it('queries commit log directly using CommitQuery instance', async () => {
    const page = await query.queryCommits(tempRepoDir, { limit: 5 });
    expect(page.commits.length).toBeGreaterThanOrEqual(4);
    expect(page.hasMore).toBe(false);
  });
});
