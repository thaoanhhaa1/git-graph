import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DiffResultSchema } from '@git-graph/shared';
import { GitCliClient, GitRepository, DiffQuery } from '../src/index';

describe('DiffQuery & GitRepository - Integration with real Git', () => {
  let client: GitCliClient;
  let tempRepoDir: string;
  let repo: GitRepository;
  let diffQuery: DiffQuery;

  let rootSha: string;
  let normalSha: string;
  let featSha: string;
  let mergeSha: string;

  beforeAll(async () => {
    const info = await GitCliClient.detect();
    client = new GitCliClient(info.path);
    diffQuery = new DiffQuery({ client });

    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-diff-int-'));

    // 1. Init repository with branch main
    await client.exec(['init', '-b', 'main', tempRepoDir]);
    await client.exec(['config', 'user.name', 'Integration Tester'], { cwd: tempRepoDir });
    await client.exec(['config', 'user.email', 'int-tester@example.com'], { cwd: tempRepoDir });
    await client.exec(['config', 'commit.gpgsign', 'false'], { cwd: tempRepoDir });

    // 2. Root commit
    const rootFile = path.join(tempRepoDir, 'hello.txt');
    fs.writeFileSync(rootFile, 'line 1\nline 2\nline 3\n');
    await client.exec(['add', 'hello.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'root commit'], { cwd: tempRepoDir });
    rootSha = (await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir })).stdout.trim();

    // 3. Normal commit: modify hello.txt, add file2.txt, add binary.dat
    fs.appendFileSync(rootFile, 'line 4 added\n');
    fs.writeFileSync(path.join(tempRepoDir, 'file2.txt'), 'file 2 content\n');
    const binaryData = Buffer.from([0x00, 0xff, 0xfe, 0xfd, 0x00, 0x01]);
    fs.writeFileSync(path.join(tempRepoDir, 'binary.dat'), binaryData);

    await client.exec(['add', '.'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'second commit'], { cwd: tempRepoDir });
    normalSha = (await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir })).stdout.trim();

    // 4. Branch & merge
    await client.exec(['checkout', '-b', 'branch-b'], { cwd: tempRepoDir });
    fs.writeFileSync(path.join(tempRepoDir, 'branch-b.txt'), 'b content\n');
    await client.exec(['add', 'branch-b.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'commit on branch b'], { cwd: tempRepoDir });
    featSha = (await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir })).stdout.trim();

    await client.exec(['checkout', 'main'], { cwd: tempRepoDir });
    fs.writeFileSync(path.join(tempRepoDir, 'main-b.txt'), 'main content\n');
    await client.exec(['add', 'main-b.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'commit on main'], { cwd: tempRepoDir });

    await client.exec(['merge', '--no-ff', 'branch-b', '-m', 'merge branch b'], {
      cwd: tempRepoDir,
    });
    mergeSha = (await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir })).stdout.trim();

    const openRepo = await GitRepository.open(tempRepoDir, { client, diffQuery });
    expect(openRepo).not.toBeNull();
    repo = openRepo!;
  });

  afterAll(() => {
    if (tempRepoDir && fs.existsSync(tempRepoDir)) {
      fs.rmSync(tempRepoDir, { recursive: true, force: true });
    }
  });

  it('queries root commit diff against empty tree', async () => {
    const result = await diffQuery.queryDiff(tempRepoDir, { sha: rootSha });

    expect(result.isTruncated).toBe(false);
    expect(result.isBinary).toBe(false);
    expect(result.diff).toContain('diff --git a/hello.txt b/hello.txt');
    expect(result.diff).toContain('+line 1');
    expect(result.diff).toContain('+line 2');

    expect(DiffResultSchema.safeParse(result).success).toBe(true);
  });

  it('queries normal commit diff with modified and added lines', async () => {
    const result = await diffQuery.queryDiff(tempRepoDir, { sha: normalSha });

    expect(result.isTruncated).toBe(false);
    expect(result.diff).toContain('diff --git a/hello.txt b/hello.txt');
    expect(result.diff).toContain('+line 4 added');
    expect(result.diff).toContain('diff --git a/file2.txt b/file2.txt');

    expect(DiffResultSchema.safeParse(result).success).toBe(true);
  });

  it('queries single file diff with filePath filter', async () => {
    const result = await diffQuery.queryDiff(tempRepoDir, {
      sha: normalSha,
      filePath: 'hello.txt',
    });

    expect(result.diff).toContain('diff --git a/hello.txt b/hello.txt');
    expect(result.diff).not.toContain('file2.txt');
    expect(result.diff).not.toContain('binary.dat');
  });

  it('detects binary file diff and returns clean message', async () => {
    const result = await diffQuery.queryDiff(tempRepoDir, {
      sha: normalSha,
      filePath: 'binary.dat',
    });

    expect(result.isBinary).toBe(true);
    expect(result.isTruncated).toBe(false);
    expect(result.diff).toContain('Binary files differ');
    expect(DiffResultSchema.safeParse(result).success).toBe(true);
  });

  it('truncates oversized diff when maxBytes is exceeded', async () => {
    // Set maxBytes to a very small size (60 bytes)
    const result = await diffQuery.queryDiff(tempRepoDir, {
      sha: normalSha,
      maxBytes: 60,
    });

    expect(result.isTruncated).toBe(true);
    expect(result.diff).toContain('Diff truncated: exceeded maximum display limit');
    expect(result.totalBytes).toBeGreaterThan(60);
    expect(result.truncatedBytes).toBeDefined();

    expect(DiffResultSchema.safeParse(result).success).toBe(true);
  });

  it('queries merge commit diff with default parent and explicit parentSha', async () => {
    // 1. Default comparison (against parent 1 - main branch)
    const defaultDiff = await diffQuery.queryDiff(tempRepoDir, { sha: mergeSha });
    expect(defaultDiff.diff).toContain('branch-b.txt');

    // 2. Explicit comparison against parent 2 (branch-b)
    const parent2Diff = await diffQuery.queryDiff(tempRepoDir, {
      sha: mergeSha,
      parentSha: featSha,
    });
    expect(parent2Diff.diff).toContain('main-b.txt');
  });

  it('verifies GitRepository getDiff and getCommitDiff integration', async () => {
    const structuredDiff = await repo.getDiff({ sha: normalSha });
    expect(structuredDiff.isTruncated).toBe(false);
    expect(structuredDiff.diff).toContain('+line 4 added');

    const stringDiff = await repo.getCommitDiff(normalSha);
    expect(typeof stringDiff).toBe('string');
    expect(stringDiff).toContain('+line 4 added');
  });
});
