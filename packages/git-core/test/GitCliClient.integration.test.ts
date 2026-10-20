import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GitCliClient, GitCommandError } from '../src/index';

describe('GitCliClient - Integration with real Git', () => {
  let client: GitCliClient;
  let tempRepoDir: string;

  beforeAll(async () => {
    // 1. Detect real git executable on current system
    const info = await GitCliClient.detect();
    client = new GitCliClient(info.path);

    // 2. Create a temporary directory for Git tests
    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-test-'));

    // 3. Initialize temporary repository
    await client.exec(['init', tempRepoDir]);
    await client.exec(['config', 'user.name', 'Git Graph Bot'], { cwd: tempRepoDir });
    await client.exec(['config', 'user.email', 'bot@example.com'], { cwd: tempRepoDir });
    await client.exec(['config', 'commit.gpgsign', 'false'], { cwd: tempRepoDir });
  });

  afterAll(() => {
    if (tempRepoDir && fs.existsSync(tempRepoDir)) {
      try {
        fs.rmSync(tempRepoDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failure on temporary dir
      }
    }
  });

  it('detects system Git and retrieves valid version (>= 2)', async () => {
    const version = await client.getVersion();
    expect(version.major).toBeGreaterThanOrEqual(2);
    expect(version.raw).toContain('git version');
  });

  it('preserves UTF-8 and Vietnamese characters in commit messages and log outputs', async () => {
    const filePath = path.join(tempRepoDir, 'tài_liệu.txt');
    const content = 'Nội dung tiếng Việt có dấu: Cộng hòa Xã hội Chủ nghĩa Việt Nam 🇻🇳';
    fs.writeFileSync(filePath, content, 'utf-8');

    await client.exec(['add', '.'], { cwd: tempRepoDir });

    const commitMessage = 'feat: Khởi tạo tài liệu dự án tiếng Việt 🚀';
    await client.exec(['commit', '-m', commitMessage], { cwd: tempRepoDir });

    // Read back via git log
    const logResult = await client.exec(['log', '-1', '--pretty=format:%s'], {
      cwd: tempRepoDir,
    });

    expect(logResult.stdout.trim()).toBe(commitMessage);
  });

  it('preserves arguments containing spaces and quotes', async () => {
    const branchName = 'feature/branch-with-name';
    await client.exec(['checkout', '-b', branchName], { cwd: tempRepoDir });

    const branchResult = await client.exec(['branch', '--show-current'], {
      cwd: tempRepoDir,
    });
    expect(branchResult.stdout.trim()).toBe(branchName);
  });

  it('throws GitCommandError when running failing Git commands with real stderr', async () => {
    try {
      await client.exec(['checkout', 'non-existent-branch-deadbeef'], {
        cwd: tempRepoDir,
      });
      expect.unreachable('Should have thrown GitCommandError');
    } catch (err) {
      expect(err).toBeInstanceOf(GitCommandError);
      const gitErr = err as GitCommandError;
      expect(gitErr.exitCode).not.toBe(0);
      expect(gitErr.stderr).toMatch(/(pathspec|error|fatal)/i);
    }
  });
});
