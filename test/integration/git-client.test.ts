import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GitCliClient } from '@git-graph/git-core';

describe('Root Integration Test: GitCliClient with System Git', () => {
  let client: GitCliClient;
  let tempRepoDir: string;

  beforeAll(async () => {
    const info = await GitCliClient.detect();
    client = new GitCliClient(info.path);
    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-root-int-'));

    await client.exec(['init', tempRepoDir]);
    await client.exec(['config', 'user.name', 'CI Runner'], { cwd: tempRepoDir });
    await client.exec(['config', 'user.email', 'ci@example.com'], { cwd: tempRepoDir });
    await client.exec(['config', 'commit.gpgsign', 'false'], { cwd: tempRepoDir });
  });

  afterAll(() => {
    if (tempRepoDir && fs.existsSync(tempRepoDir)) {
      try {
        fs.rmSync(tempRepoDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failure
      }
    }
  });

  it('runs git commands with buffer output on real repository', async () => {
    const version = await client.getVersion();
    expect(version.major).toBeGreaterThan(0);

    const testFile = path.join(tempRepoDir, 'hello.txt');
    fs.writeFileSync(testFile, 'Xin chào Việt Nam 🇻🇳', 'utf-8');

    await client.exec(['add', '.'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'test: commit hello file'], { cwd: tempRepoDir });

    const logRes = await client.exec(['log', '-1', '--oneline'], { cwd: tempRepoDir });
    expect(logRes.exitCode).toBe(0);
    expect(logRes.stdout).toContain('test: commit hello file');
  });
});
