import { describe, expect, it } from 'vitest';
import type { GitClient, GitExecOptions, GitVersion } from '../src/client/GitClient';
import type { GitResult } from '../src/client/GitResult';
import { CommitDetailsQuery } from '../src/queries/CommitDetailsQuery';
import { FIELD_SEPARATOR, RECORD_SEPARATOR } from '../src/parsers/CommitLogParser';

class MockGitClient implements GitClient {
  public readonly gitPath = 'git';

  public async getVersion(): Promise<GitVersion> {
    return { raw: 'git version 2.40.0', major: 2, minor: 40, patch: 0 };
  }

  public executedCommands: { args: string[]; options?: GitExecOptions }[] = [];
  public handler?: (
    args: string[],
    options?: GitExecOptions,
  ) => Promise<Partial<GitResult>> | Partial<GitResult>;

  public async exec(args: readonly string[], options?: GitExecOptions): Promise<GitResult> {
    const argsArray = [...args];
    this.executedCommands.push({ args: argsArray, options });
    const defaultResult: GitResult = {
      stdout: '',
      stderr: '',
      stdoutBuffer: Buffer.alloc(0),
      stderrBuffer: Buffer.alloc(0),
      exitCode: 0,
      durationMs: 5,
      command: 'git',
      args: argsArray,
    };
    if (this.handler) {
      const res = await this.handler(argsArray, options);
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

function createDetailsRecord(
  sha: string,
  parents: string[],
  subject: string,
  body: string = '',
): string {
  return [
    sha,
    sha.slice(0, 7),
    parents.join(' '),
    'Author Name',
    'author@example.com',
    '1710000000',
    '+07:00',
    'Committer Name',
    'committer@example.com',
    '1710000000',
    '+07:00',
    'HEAD -> main',
    subject,
    body,
  ].join(FIELD_SEPARATOR);
}

describe('CommitDetailsQuery - Unit Tests', () => {
  it('queries normal single-parent commit with diff-tree', async () => {
    const mock = new MockGitClient();
    const sha = '1'.repeat(40);
    const parentSha = '2'.repeat(40);

    mock.handler = (args) => {
      if (args[0] === 'log') {
        return {
          stdout: `${RECORD_SEPARATOR}${createDetailsRecord(sha, [parentSha], 'feat: add feature', 'Detailed commit message body')}${RECORD_SEPARATOR}`,
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      if (args[0] === 'diff-tree' && args.includes('--numstat')) {
        return {
          stdout: '10\t2\tsrc/feature.ts\n-\t-\tassets/icon.png\n',
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      if (args[0] === 'diff-tree' && args.includes('--name-status')) {
        return {
          stdout: 'M\tsrc/feature.ts\nA\tassets/icon.png\n',
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      return { stdout: '', stderr: '', exitCode: 0, durationMs: 1, command: 'git', args };
    };

    const query = new CommitDetailsQuery({ client: mock });
    const result = await query.queryDetails('/repo', sha);

    expect(result).not.toBeNull();
    expect(result!.commit.sha).toBe(sha);
    expect(result!.commit.subject).toBe('feat: add feature');
    expect(result!.commit.body).toBe('Detailed commit message body');
    expect(result!.fileChanges).toHaveLength(2);

    expect(result!.fileChanges[0]).toEqual({
      path: 'src/feature.ts',
      oldPath: undefined,
      status: 'modified',
      additions: 10,
      deletions: 2,
      isBinary: false,
      similarity: undefined,
    });

    expect(result!.fileChanges[1]).toEqual({
      path: 'assets/icon.png',
      oldPath: undefined,
      status: 'added',
      additions: undefined,
      deletions: undefined,
      isBinary: true,
      similarity: undefined,
    });

    expect(result!.stats).toEqual({
      filesChanged: 2,
      additions: 10,
      deletions: 2,
    });

    // Check that diff-tree command was executed without --root and against no parent explicitly
    const diffTreeCmd = mock.executedCommands.find((c) => c.args[0] === 'diff-tree');
    expect(diffTreeCmd).toBeDefined();
    expect(diffTreeCmd!.args).not.toContain('--root');
  });

  it('queries root commit with --root flag', async () => {
    const mock = new MockGitClient();
    const rootSha = 'a'.repeat(40);

    mock.handler = (args) => {
      if (args[0] === 'log') {
        return {
          stdout: `${RECORD_SEPARATOR}${createDetailsRecord(rootSha, [], 'Initial commit')}${RECORD_SEPARATOR}`,
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      if (args[0] === 'diff-tree' && args.includes('--numstat')) {
        return {
          stdout: '50\t0\tREADME.md\n',
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      if (args[0] === 'diff-tree' && args.includes('--name-status')) {
        return {
          stdout: 'A\tREADME.md\n',
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      return { stdout: '', stderr: '', exitCode: 0, durationMs: 1, command: 'git', args };
    };

    const query = new CommitDetailsQuery({ client: mock });
    const result = await query.queryDetails('/repo', rootSha);

    expect(result).not.toBeNull();
    expect(result!.commit.parents).toHaveLength(0);
    expect(result!.fileChanges).toHaveLength(1);
    expect(result!.fileChanges[0]!.status).toBe('added');
    expect(result!.stats.additions).toBe(50);

    // Verify diff-tree was called with --root
    const diffTreeCmd = mock.executedCommands.find((c) => c.args[0] === 'diff-tree');
    expect(diffTreeCmd).toBeDefined();
    expect(diffTreeCmd!.args).toContain('--root');
  });

  it('queries merge commit comparing against specified parentSha', async () => {
    const mock = new MockGitClient();
    const mergeSha = 'c'.repeat(40);
    const parent1 = '1'.repeat(40);
    const parent2 = '2'.repeat(40);

    mock.handler = (args) => {
      if (args[0] === 'log') {
        return {
          stdout: `${RECORD_SEPARATOR}${createDetailsRecord(mergeSha, [parent1, parent2], 'Merge branch feat')}${RECORD_SEPARATOR}`,
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      if (args[0] === 'diff' && args.includes('--numstat')) {
        expect(args).toContain(parent2);
        expect(args).toContain(mergeSha);
        return {
          stdout: '20\t5\tmerged.ts\n',
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      if (args[0] === 'diff' && args.includes('--name-status')) {
        return {
          stdout: 'M\tmerged.ts\n',
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      return { stdout: '', stderr: '', exitCode: 0, durationMs: 1, command: 'git', args };
    };

    const query = new CommitDetailsQuery({ client: mock });
    const result = await query.queryDetails('/repo', mergeSha, { parentSha: parent2 });

    expect(result).not.toBeNull();
    expect(result!.commit.parents).toHaveLength(2);
    expect(result!.fileChanges).toHaveLength(1);
    expect(result!.fileChanges[0]!.path).toBe('merged.ts');
  });

  it('returns null when commit sha does not exist or git log fails', async () => {
    const mock = new MockGitClient();
    mock.handler = () => ({
      stdout: '',
      stderr: 'fatal: bad object non-existent',
      exitCode: 128,
      durationMs: 1,
      command: 'git',
      args: [],
    });

    const query = new CommitDetailsQuery({ client: mock });
    const result = await query.queryDetails('/repo', 'non-existent');
    expect(result).toBeNull();
  });

  it('handles empty or whitespace sha gracefully', async () => {
    const mock = new MockGitClient();
    const query = new CommitDetailsQuery({ client: mock });
    expect(await query.queryDetails('/repo', '')).toBeNull();
    expect(await query.queryDetails('/repo', '   ')).toBeNull();
    expect(mock.executedCommands).toHaveLength(0);
  });

  it('queries arbitrary range comparison with baseSha and targetSha and calculates commitCount', async () => {
    const mock = new MockGitClient();
    const baseSha = '1'.repeat(40);
    const targetSha = '2'.repeat(40);

    mock.handler = (args) => {
      if (args[0] === 'log') {
        return {
          stdout: `${RECORD_SEPARATOR}${createDetailsRecord(targetSha, [baseSha], 'feat: target commit', 'Target commit body')}${RECORD_SEPARATOR}`,
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      if (args[0] === 'rev-list' && args.includes('--count')) {
        expect(args).toContain(`${baseSha}..${targetSha}`);
        return {
          stdout: '5\n',
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      if ((args[0] === 'diff' || args[0] === 'diff-tree') && args.includes('--numstat')) {
        expect(args).toContain(baseSha);
        expect(args).toContain(targetSha);
        return {
          stdout: '20\t5\tsrc/compare.ts\n',
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      if ((args[0] === 'diff' || args[0] === 'diff-tree') && args.includes('--name-status')) {
        return {
          stdout: 'M\tsrc/compare.ts\n',
          stderr: '',
          exitCode: 0,
          durationMs: 1,
          command: 'git',
          args,
        };
      }
      return { stdout: '', stderr: '', exitCode: 0, durationMs: 1, command: 'git', args };
    };

    const query = new CommitDetailsQuery({ client: mock });
    const result = await query.queryDetails('/repo', targetSha, { baseSha, targetSha });

    expect(result).not.toBeNull();
    expect(result!.commit.sha).toBe(targetSha);
    expect(result!.commit.stats!.commitCount).toBe(5);
    expect(result!.commit.stats!.filesChanged).toBe(1);
    expect(result!.commit.stats!.additions).toBe(20);
    expect(result!.commit.stats!.deletions).toBe(5);
    expect(result!.fileChanges).toHaveLength(1);
    expect(result!.fileChanges[0]!.path).toBe('src/compare.ts');
  });
});
