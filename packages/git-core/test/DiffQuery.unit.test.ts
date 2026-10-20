import { describe, expect, it } from 'vitest';
import type { GitClient, GitExecOptions, GitVersion } from '../src/client/GitClient';
import type { GitResult } from '../src/client/GitResult';
import { DiffQuery } from '../src/queries/DiffQuery';

class MockGitClient implements GitClient {
  public gitPath = 'git';
  public async getVersion(): Promise<GitVersion> {
    return { raw: 'git version 2.40.0', major: 2, minor: 40, patch: 0 };
  }
  public executedCommands: { args: string[]; options?: GitExecOptions }[] = [];
  public handler?: (
    args: string[],
    options?: GitExecOptions,
  ) => Promise<Partial<GitResult>> | Partial<GitResult>;

  public async exec(args: readonly string[], options?: GitExecOptions): Promise<GitResult> {
    this.executedCommands.push({ args: [...args], options });
    const defaultResult: GitResult = {
      stdout: '',
      stderr: '',
      stdoutBuffer: Buffer.alloc(0),
      stderrBuffer: Buffer.alloc(0),
      exitCode: 0,
      durationMs: 5,
      command: 'git',
      args: [...args],
    };
    if (this.handler) {
      const res = await this.handler([...args], options);
      return {
        ...defaultResult,
        ...res,
        stdoutBuffer: res.stdoutBuffer ?? Buffer.from(res.stdout ?? ''),
        stderrBuffer: res.stderrBuffer ?? Buffer.from(res.stderr ?? ''),
      };
    }
    return defaultResult;
  }
}

describe('DiffQuery - Unit Tests', () => {
  it('queries diff with parentSha specified', async () => {
    const mock = new MockGitClient();
    const sha = '1'.repeat(40);
    const parentSha = '2'.repeat(40);

    const diffContent = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,4 @@',
      ' line1',
      '+line2 added',
      ' line3',
    ].join('\n');

    mock.handler = (args) => {
      expect(args[0]).toBe('diff');
      expect(args).toContain(parentSha);
      expect(args).toContain(sha);
      return {
        stdout: diffContent,
        stderr: '',
        exitCode: 0,
        durationMs: 2,
        command: 'git',
        args,
      };
    };

    const diffQuery = new DiffQuery({ client: mock });
    const result = await diffQuery.queryDiff('/repo', { sha, parentSha });

    expect(result.diff).toBe(diffContent);
    expect(result.isTruncated).toBe(false);
    expect(result.isBinary).toBe(false);
    expect(result.totalBytes).toBe(Buffer.byteLength(diffContent, 'utf8'));
  });

  it('detects root commit automatically and queries diff-tree with --root', async () => {
    const mock = new MockGitClient();
    const rootSha = 'a'.repeat(40);

    mock.handler = (args) => {
      if (args[0] === 'rev-list') {
        // Output with only root commit (0 parents)
        return {
          stdout: `${rootSha}\n`,
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      if (args[0] === 'diff-tree') {
        expect(args).toContain('--root');
        return {
          stdout: 'diff --git a/init.txt b/init.txt\n+hello\n',
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      return { stdout: '', stderr: '', exitCode: 0, durationMs: 1, command: 'git', args };
    };

    const diffQuery = new DiffQuery({ client: mock });
    const result = await diffQuery.queryDiff('/repo', { sha: rootSha });

    expect(result.diff).toContain('+hello');
    expect(result.isTruncated).toBe(false);
    expect(result.isBinary).toBe(false);
  });

  it('applies filePath filter when specified', async () => {
    const mock = new MockGitClient();
    const sha = '1'.repeat(40);

    mock.handler = (args) => {
      if (args[0] === 'rev-list') {
        return {
          stdout: `${sha} 2222222222222222222222222222222222222222\n`,
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      expect(args.slice(-2)).toEqual(['--', 'src/specific.ts']);
      return {
        stdout: 'diff for specific file\n',
        stderr: '',
        exitCode: 0,
        durationMs: 1,
        command: 'git',
        args,
      };
    };

    const diffQuery = new DiffQuery({ client: mock });
    const result = await diffQuery.queryDiff('/repo', { sha, filePath: 'src/specific.ts' });

    expect(result.diff).toBe('diff for specific file\n');
  });

  it('truncates diff when size exceeds maxBytes cleanly at newline', async () => {
    const mock = new MockGitClient();
    const sha = '1'.repeat(40);

    const line1 = 'line 1: content\n';
    const line2 = 'line 2: second content\n';
    const line3 = 'line 3: third content\n';
    const largeDiff = line1 + line2 + line3;

    mock.handler = (args) => {
      if (args[0] === 'rev-list') {
        return {
          stdout: `${sha} 2222222222222222222222222222222222222222\n`,
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      return {
        stdout: largeDiff,
        stderr: '',
        exitCode: 0,
        durationMs: 1,
        command: 'git',
        args,
      };
    };

    const diffQuery = new DiffQuery({ client: mock });
    // Limit maxBytes to only fit line1 and line2
    const maxBytes = Buffer.byteLength(line1 + line2, 'utf8') + 5;
    const result = await diffQuery.queryDiff('/repo', { sha, maxBytes });

    expect(result.isTruncated).toBe(true);
    expect(result.diff).toContain(line1.trim());
    expect(result.diff).toContain(line2.trim());
    expect(result.diff).not.toContain(line3.trim());
    expect(result.diff).toContain('Diff truncated: exceeded maximum display limit');
    expect(result.totalBytes).toBe(Buffer.byteLength(largeDiff, 'utf8'));
    expect(result.truncatedBytes).toBeDefined();
  });

  it('detects binary file diff and returns clean placeholder message', async () => {
    const mock = new MockGitClient();
    const sha = '1'.repeat(40);

    mock.handler = (args) => {
      if (args[0] === 'rev-list') {
        return {
          stdout: `${sha} 2222222222222222222222222222222222222222\n`,
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      return {
        stdout: 'Binary files a/assets/img.png and b/assets/img.png differ\n',
        stderr: '',
        exitCode: 0,
        durationMs: 1,
        command: 'git',
        args,
      };
    };

    const diffQuery = new DiffQuery({ client: mock });
    const result = await diffQuery.queryDiff('/repo', { sha });

    expect(result.isBinary).toBe(true);
    expect(result.isTruncated).toBe(false);
    expect(result.diff).toContain('Binary files differ');
  });

  it('queries staged worktree diffs against HEAD', async () => {
    const mock = new MockGitClient();
    mock.handler = () => ({
      stdout: 'diff --git a/a.ts b/a.ts\n+staged\n',
    });

    const diffQuery = new DiffQuery({ client: mock });
    const result = await diffQuery.queryWorktreeDiff('/repo', {
      filePath: 'src/a.ts',
      staged: true,
    });

    expect(mock.executedCommands.at(-1)?.args).toEqual([
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--cached',
      'HEAD',
      '--',
      'src/a.ts',
    ]);
    expect(result.diff).toContain('+staged');
  });

  it('queries unstaged worktree diffs against HEAD and tolerates exit code 1 for untracked files', async () => {
    const mock = new MockGitClient();
    mock.handler = () => ({
      stdout: 'diff --git a/new.ts b/new.ts\n+new\n',
      exitCode: 1,
    });

    const diffQuery = new DiffQuery({ client: mock });
    const result = await diffQuery.queryWorktreeDiff('/repo', {
      filePath: 'new.ts',
      untracked: true,
    });

    expect(mock.executedCommands.at(-1)?.args).toEqual([
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--no-index',
      '--',
      '/dev/null',
      'new.ts',
    ]);
    expect(result.diff).toContain('+new');
  });

  it('throws helpful error when git diff command fails', async () => {
    const mock = new MockGitClient();
    mock.handler = () => ({
      stdout: '',
      stderr: 'fatal: bad object',
      exitCode: 128,
      durationMs: 1,
      command: 'git',
      args: [],
    });

    const diffQuery = new DiffQuery({ client: mock });
    await expect(diffQuery.queryDiff('/repo', { sha: 'invalid-sha' })).rejects.toThrow(
      /Git diff failed with exit code 128/,
    );
  });

  it('queries diff between arbitrary range using baseSha and targetSha', async () => {
    const mock = new MockGitClient();
    const baseSha = '1'.repeat(40);
    const targetSha = '2'.repeat(40);

    const diffContent = [
      'diff --git a/app.ts b/app.ts',
      '--- a/app.ts',
      '+++ b/app.ts',
      '@@ -1,3 +1,4 @@',
      ' line1',
      '+line2 in range',
      ' line3',
    ].join('\n');

    mock.handler = (args) => {
      expect(args[0]).toBe('diff');
      expect(args).toContain(baseSha);
      expect(args).toContain(targetSha);
      expect(args).toContain('--');
      expect(args).toContain('app.ts');
      return {
        stdout: diffContent,
        stderr: '',
        exitCode: 0,
        durationMs: 2,
        command: 'git',
        args,
      };
    };

    const diffQuery = new DiffQuery({ client: mock });
    const result = await diffQuery.queryDiff('/repo', {
      sha: targetSha,
      baseSha,
      targetSha,
      filePath: 'app.ts',
    });

    expect(result.diff).toContain('+line2 in range');
    expect(result.isBinary).toBe(false);
  });
});
