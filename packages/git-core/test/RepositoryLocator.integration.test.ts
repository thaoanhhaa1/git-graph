import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GitCliClient, RepositoryLocator } from '../src/index';

describe('RepositoryLocator - Integration with real Git', () => {
  let client: GitCliClient;
  let locator: RepositoryLocator;
  let baseTempDir: string;
  let standardRepoDir: string;
  let bareRepoDir: string;
  let nonGitDir: string;
  let firstCommitSha: string;

  beforeAll(async () => {
    const info = await GitCliClient.detect();
    client = new GitCliClient(info.path);
    locator = new RepositoryLocator({ gitClient: client });

    baseTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-locator-int-'));
    standardRepoDir = path.join(baseTempDir, 'standard-repo');
    bareRepoDir = path.join(baseTempDir, 'bare-repo.git');
    nonGitDir = path.join(baseTempDir, 'non-git-dir');

    // 1. Setup standard working repo
    fs.mkdirSync(standardRepoDir, { recursive: true });
    await client.exec(['init', '-b', 'main', standardRepoDir]);
    await client.exec(['config', 'user.name', 'Tester'], { cwd: standardRepoDir });
    await client.exec(['config', 'user.email', 'tester@example.com'], { cwd: standardRepoDir });
    await client.exec(['config', 'commit.gpgsign', 'false'], { cwd: standardRepoDir });

    const file1 = path.join(standardRepoDir, 'README.md');
    fs.writeFileSync(file1, '# Test Project\n');
    await client.exec(['add', 'README.md'], { cwd: standardRepoDir });
    await client.exec(['commit', '-m', 'Initial commit'], { cwd: standardRepoDir });

    const headResult = await client.exec(['rev-parse', 'HEAD'], { cwd: standardRepoDir });
    firstCommitSha = headResult.stdout.trim();

    // 2. Setup bare repo
    fs.mkdirSync(bareRepoDir, { recursive: true });
    await client.exec(['init', '--bare', bareRepoDir]);

    // 3. Setup non-git directory
    fs.mkdirSync(nonGitDir, { recursive: true });
    fs.writeFileSync(path.join(nonGitDir, 'some-file.txt'), 'Not a git repo');
  });

  afterAll(() => {
    if (baseTempDir && fs.existsSync(baseTempDir)) {
      try {
        fs.rmSync(baseTempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('locates standard repository and populates metadata correctly', async () => {
    const descriptor = await locator.locate(standardRepoDir);

    expect(descriptor).not.toBeNull();
    expect(descriptor?.isBare).toBe(false);
    expect(descriptor?.rootPath).toBe(path.normalize(fs.realpathSync(standardRepoDir)));
    expect(descriptor?.currentBranch).toBe('main');
    expect(descriptor?.isDetachedHead).toBe(false);
    expect(descriptor?.headCommitSha).toBe(firstCommitSha);
    expect(descriptor?.gitDir).toContain('.git');
  });

  it('locates bare repository and marks isBare true', async () => {
    const descriptor = await locator.locate(bareRepoDir);

    expect(descriptor).not.toBeNull();
    expect(descriptor?.isBare).toBe(true);
    expect(descriptor?.rootPath).toBe(path.normalize(fs.realpathSync(bareRepoDir)));
  });

  it('returns null for non-git directory', async () => {
    const descriptor = await locator.locate(nonGitDir);
    expect(descriptor).toBeNull();
  });

  it('detects detached HEAD when checkout commit SHA directly', async () => {
    // Add second commit
    const file2 = path.join(standardRepoDir, 'file2.txt');
    fs.writeFileSync(file2, 'Second file\n');
    await client.exec(['add', 'file2.txt'], { cwd: standardRepoDir });
    await client.exec(['commit', '-m', 'Second commit'], { cwd: standardRepoDir });

    // Detach HEAD to first commit
    await client.exec(['checkout', firstCommitSha], { cwd: standardRepoDir });

    const descriptor = await locator.locate(standardRepoDir);
    expect(descriptor).not.toBeNull();
    expect(descriptor?.isDetachedHead).toBe(true);
    expect(descriptor?.currentBranch).toBeUndefined();
    expect(descriptor?.headCommitSha).toBe(firstCommitSha);

    // Switch back to main
    await client.exec(['checkout', 'main'], { cwd: standardRepoDir });
  });

  it('deduplicates nested subdirectories in locateAll', async () => {
    const subFolder1 = path.join(standardRepoDir, 'src', 'components');
    const subFolder2 = path.join(standardRepoDir, 'docs');
    fs.mkdirSync(subFolder1, { recursive: true });
    fs.mkdirSync(subFolder2, { recursive: true });

    const candidates = [subFolder1, standardRepoDir, nonGitDir, subFolder2, bareRepoDir];

    const results = await locator.locateAll(candidates);

    // Should only contain standardRepoDir and bareRepoDir (nonGitDir excluded, nested deduplicated)
    expect(results).toHaveLength(2);
    const rootPaths = results.map((r) => r.rootPath);
    expect(rootPaths).toContain(path.normalize(fs.realpathSync(standardRepoDir)));
    expect(rootPaths).toContain(path.normalize(fs.realpathSync(bareRepoDir)));
  });
});
