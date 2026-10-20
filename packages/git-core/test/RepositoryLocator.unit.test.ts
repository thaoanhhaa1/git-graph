import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { GitClient, GitExecutionOptions, GitResult, GitVersion } from '../src/index';
import { RepositoryLocator } from '../src/index';

/**
 * Mock implementation of GitClient for predictable unit testing.
 */
class MockGitClient implements GitClient {
  public readonly gitPath = '/usr/bin/git';
  public commandHandlers: Map<
    string,
    (options?: GitExecutionOptions) => GitResult | Promise<GitResult>
  > = new Map();
  public executedCalls: { args: readonly string[]; options?: GitExecutionOptions }[] = [];

  public registerCommand(
    argsPattern: string,
    handler: (options?: GitExecutionOptions) => GitResult,
  ): void {
    this.commandHandlers.set(argsPattern, handler);
  }

  public async getVersion(): Promise<GitVersion> {
    return { raw: 'git version 2.40.0', major: 2, minor: 40, patch: 0 };
  }

  public async exec(args: readonly string[], options?: GitExecutionOptions): Promise<GitResult> {
    this.executedCalls.push({ args, options });
    const key = args.join(' ');

    const handler = this.commandHandlers.get(key);
    if (handler) {
      return handler(options);
    }

    throw new Error(`Unhandled mock git command: ${key}`);
  }
}

function createResult(stdoutText: string, exitCode = 0, stderrText = ''): GitResult {
  return {
    stdout: stdoutText,
    stderr: stderrText,
    stdoutBuffer: Buffer.from(stdoutText),
    stderrBuffer: Buffer.from(stderrText),
    exitCode,
    signal: null,
    durationMs: 5,
    command: 'git',
    args: [],
  };
}

describe('RepositoryLocator - Unit Tests', () => {
  let tempDir: string;
  let mockGitClient: MockGitClient;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-locator-test-'));
    mockGitClient = new MockGitClient();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns null for non-existent candidate directory', async () => {
    const locator = new RepositoryLocator({ gitClient: mockGitClient });
    const nonExistent = path.join(tempDir, 'does-not-exist');

    const result = await locator.locate(nonExistent);
    expect(result).toBeNull();
  });

  it('returns null for a file path instead of directory', async () => {
    const locator = new RepositoryLocator({ gitClient: mockGitClient });
    const filePath = path.join(tempDir, 'some-file.txt');
    fs.writeFileSync(filePath, 'hello');

    const result = await locator.locate(filePath);
    expect(result).toBeNull();
  });

  it('returns null if git commands fail indicating not a git repository', async () => {
    const locator = new RepositoryLocator({ gitClient: mockGitClient });
    // mockGitClient will throw for any command by default
    const result = await locator.locate(tempDir);
    expect(result).toBeNull();
  });

  it('locates a standard working tree repository with normal branch', async () => {
    const repoPath = path.join(tempDir, 'my-project');
    fs.mkdirSync(repoPath, { recursive: true });

    mockGitClient.registerCommand('rev-parse --is-bare-repository', () => createResult('false\n'));
    mockGitClient.registerCommand('rev-parse --show-toplevel', () => createResult(`${repoPath}\n`));
    mockGitClient.registerCommand('rev-parse --git-dir', () => createResult('.git\n'));
    mockGitClient.registerCommand('rev-parse HEAD', () =>
      createResult('1234567890abcdef1234567890abcdef12345678\n'),
    );
    mockGitClient.registerCommand('symbolic-ref --short -q HEAD', () => createResult('main\n'));

    const locator = new RepositoryLocator({ gitClient: mockGitClient });
    const descriptor = await locator.locate(repoPath);

    expect(descriptor).not.toBeNull();
    expect(descriptor?.name).toBe('my-project');
    expect(descriptor?.rootPath).toBe(path.normalize(fs.realpathSync(repoPath)));
    expect(descriptor?.gitDir).toBe(path.join(path.normalize(fs.realpathSync(repoPath)), '.git'));
    expect(descriptor?.isBare).toBe(false);
    expect(descriptor?.currentBranch).toBe('main');
    expect(descriptor?.isDetachedHead).toBe(false);
    expect(descriptor?.headCommitSha).toBe('1234567890abcdef1234567890abcdef12345678');
  });

  it('detects detached HEAD state', async () => {
    const repoPath = path.join(tempDir, 'detached-repo');
    fs.mkdirSync(repoPath, { recursive: true });

    mockGitClient.registerCommand('rev-parse --is-bare-repository', () => createResult('false\n'));
    mockGitClient.registerCommand('rev-parse --show-toplevel', () => createResult(`${repoPath}\n`));
    mockGitClient.registerCommand('rev-parse --git-dir', () => createResult('.git\n'));
    mockGitClient.registerCommand('rev-parse HEAD', () =>
      createResult('abcdef1234567890abcdef1234567890abcdef12\n'),
    );
    // symbolic-ref throws when HEAD is detached
    // Note: unhandled command in mockGitClient throws error, which matches git behavior

    const locator = new RepositoryLocator({ gitClient: mockGitClient });
    const descriptor = await locator.locate(repoPath);

    expect(descriptor).not.toBeNull();
    expect(descriptor?.isDetachedHead).toBe(true);
    expect(descriptor?.currentBranch).toBeUndefined();
    expect(descriptor?.headCommitSha).toBe('abcdef1234567890abcdef1234567890abcdef12');
  });

  it('detects a bare repository', async () => {
    const barePath = path.join(tempDir, 'bare-repo.git');
    fs.mkdirSync(barePath, { recursive: true });

    mockGitClient.registerCommand('rev-parse --is-bare-repository', () => createResult('true\n'));
    mockGitClient.registerCommand('rev-parse --git-dir', () => createResult('.\n'));
    mockGitClient.registerCommand('rev-parse HEAD', () =>
      createResult('fedcba0987654321fedcba0987654321fedcba09\n'),
    );
    mockGitClient.registerCommand('symbolic-ref --short -q HEAD', () => createResult('master\n'));

    const locator = new RepositoryLocator({ gitClient: mockGitClient });
    const descriptor = await locator.locate(barePath);

    expect(descriptor).not.toBeNull();
    expect(descriptor?.isBare).toBe(true);
    expect(descriptor?.rootPath).toBe(path.normalize(fs.realpathSync(barePath)));
    expect(descriptor?.gitDir).toBe(path.normalize(fs.realpathSync(barePath)));
    expect(descriptor?.currentBranch).toBe('master');
    expect(descriptor?.isDetachedHead).toBe(false);
  });

  it('deduplicates nested workspace folders pointing to the same repository', async () => {
    const repoRoot = path.join(tempDir, 'monorepo');
    const nestedPkg1 = path.join(repoRoot, 'packages', 'pkg-a');
    const nestedPkg2 = path.join(repoRoot, 'packages', 'pkg-b');
    const otherRepo = path.join(tempDir, 'other-repo');

    fs.mkdirSync(nestedPkg1, { recursive: true });
    fs.mkdirSync(nestedPkg2, { recursive: true });
    fs.mkdirSync(otherRepo, { recursive: true });

    mockGitClient.registerCommand('rev-parse --is-bare-repository', () => createResult('false\n'));
    mockGitClient.registerCommand('rev-parse --show-toplevel', (opts) => {
      if (opts?.cwd && opts.cwd.includes('other-repo')) {
        return createResult(`${otherRepo}\n`);
      }
      return createResult(`${repoRoot}\n`);
    });
    mockGitClient.registerCommand('rev-parse --git-dir', () => createResult('.git\n'));
    mockGitClient.registerCommand('rev-parse HEAD', () =>
      createResult('1111111111111111111111111111111111111111\n'),
    );
    mockGitClient.registerCommand('symbolic-ref --short -q HEAD', () => createResult('main\n'));

    const locator = new RepositoryLocator({ gitClient: mockGitClient });
    const candidatePaths = [nestedPkg1, repoRoot, nestedPkg2, otherRepo];

    const results = await locator.locateAll(candidatePaths);

    expect(results).toHaveLength(2);
    const rootPaths = results.map((r) => r.rootPath);
    expect(rootPaths).toContain(path.normalize(fs.realpathSync(repoRoot)));
    expect(rootPaths).toContain(path.normalize(fs.realpathSync(otherRepo)));
  });

  it('locates empty repository without commits gracefully', async () => {
    const emptyRepo = path.join(tempDir, 'empty-repo');
    fs.mkdirSync(emptyRepo, { recursive: true });

    mockGitClient.registerCommand('rev-parse --is-bare-repository', () => createResult('false\n'));
    mockGitClient.registerCommand('rev-parse --show-toplevel', () =>
      createResult(`${emptyRepo}\n`),
    );
    mockGitClient.registerCommand('rev-parse --git-dir', () => createResult('.git\n'));
    mockGitClient.registerCommand('rev-parse --abbrev-ref HEAD', () => createResult('main\n'));

    const locator = new RepositoryLocator({ gitClient: mockGitClient });
    const descriptor = await locator.locate(emptyRepo);

    expect(descriptor).not.toBeNull();
    expect(descriptor?.headCommitSha).toBeUndefined();
    expect(descriptor?.currentBranch).toBe('main');
    expect(descriptor?.isDetachedHead).toBe(false);
  });

  it('parses .gitmodules file when submodules are present', async () => {
    const repoRoot = path.join(tempDir, 'submodule-repo');
    fs.mkdirSync(repoRoot, { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, '.gitmodules'),
      '[submodule "lib/utils"]\n\tpath = lib/utils\n\turl = https://github.com/example/utils.git\n',
    );

    mockGitClient.registerCommand('rev-parse --is-bare-repository', () => createResult('false\n'));
    mockGitClient.registerCommand('rev-parse --show-toplevel', () => createResult(`${repoRoot}\n`));
    mockGitClient.registerCommand('rev-parse --git-dir', () => createResult('.git\n'));
    mockGitClient.registerCommand('rev-parse HEAD', () =>
      createResult('2222222222222222222222222222222222222222\n'),
    );
    mockGitClient.registerCommand('symbolic-ref --short -q HEAD', () => createResult('main\n'));
    mockGitClient.registerCommand(
      'config --file .gitmodules --get-regexp ^submodule\\..*\\.path$',
      () => createResult('submodule.lib/utils.path lib/utils\n'),
    );

    const locator = new RepositoryLocator({ gitClient: mockGitClient });
    const descriptor = await locator.locate(repoRoot);

    expect(descriptor).not.toBeNull();
    expect(descriptor?.submodules).toBeDefined();
    expect(descriptor?.submodules).toHaveLength(1);
    expect(descriptor?.submodules?.[0]?.name).toBe('lib/utils');
    expect(descriptor?.submodules?.[0]?.path).toBe('lib/utils');
  });
});
