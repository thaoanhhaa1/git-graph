import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  GitClient,
  GitExecutionOptions,
  GitResult,
  GitVersion,
} from '../src/client/GitClient';
import { SubmoduleQuery } from '../src/queries/SubmoduleQuery';

class MockGitClient implements GitClient {
  public readonly gitPath = 'git';
  public readonly calls: Array<{ args: string[]; cwd?: string }> = [];

  public constructor(
    private readonly handler: (
      args: string[],
      cwd?: string,
    ) => Partial<GitResult> | undefined = () => undefined,
  ) {}

  public async getVersion(): Promise<GitVersion> {
    return { raw: 'git version 2.40.0', major: 2, minor: 40, patch: 0 };
  }

  public async exec(args: readonly string[], options?: GitExecutionOptions): Promise<GitResult> {
    const argsArray = [...args];
    this.calls.push({ args: argsArray, cwd: options?.cwd });
    const override = this.handler(argsArray, options?.cwd);
    const stdout = override?.stdout ?? '';
    return {
      stdout,
      stderr: override?.stderr ?? '',
      stdoutBuffer: Buffer.from(stdout),
      stderrBuffer: Buffer.from(override?.stderr ?? ''),
      exitCode: override?.exitCode ?? 0,
      durationMs: 1,
      command: 'git',
      args: argsArray,
    };
  }
}

describe('SubmoduleQuery', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-submodule-'));
    fs.writeFileSync(
      path.join(tempDir, '.gitmodules'),
      '[submodule "libs/core"]\n\tpath = libs/core\n\turl = https://example.com/core.git\n',
    );
    fs.mkdirSync(path.join(tempDir, 'libs/core'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports recorded/head SHAs, dirty state, and ahead/behind counts', async () => {
    const recorded = '1'.repeat(40);
    const head = '2'.repeat(40);
    const submodulePath = path.join(tempDir, 'libs/core');
    const client = new MockGitClient((args, cwd) => {
      if (args[0] === 'config') {
        return {
          stdout:
            'submodule.libs/core.path libs/core\nsubmodule.libs/core.url https://example.com/core.git\n',
        };
      }
      if (args[0] === 'ls-tree') {
        return { stdout: `160000 commit ${recorded}\tlibs/core\n` };
      }
      if (cwd === submodulePath && args[0] === 'rev-parse') {
        return { stdout: `${head}\n` };
      }
      if (cwd === submodulePath && args[0] === 'status') {
        return { stdout: ' M src/index.ts\0' };
      }
      if (cwd === submodulePath && args[0] === 'rev-list') {
        return { stdout: '2\t3\n' };
      }
      return undefined;
    });

    const query = new SubmoduleQuery({ client });
    const submodules = await query.list(tempDir);

    expect(submodules).toHaveLength(1);
    expect(submodules[0]).toMatchObject({
      name: 'libs/core',
      path: 'libs/core',
      url: 'https://example.com/core.git',
      recordedSha: recorded,
      headSha: head,
      state: 'dirty',
      behind: 2,
      ahead: 3,
    });
  });

  it('marks submodules without a checked-out worktree as uninitialized', async () => {
    fs.rmSync(path.join(tempDir, 'libs/core'), { recursive: true, force: true });
    const client = new MockGitClient((args) => {
      if (args[0] === 'config') {
        return { stdout: 'submodule.libs/core.path libs/core\n' };
      }
      if (args[0] === 'ls-tree') {
        return { stdout: `160000 commit ${'3'.repeat(40)}\tlibs/core\n` };
      }
      return undefined;
    });

    const query = new SubmoduleQuery({ client });
    const submodules = await query.list(tempDir);

    expect(submodules[0]).toMatchObject({
      path: 'libs/core',
      recordedSha: '3'.repeat(40),
      state: 'uninitialized',
    });
    expect(submodules[0]?.headSha).toBeUndefined();
  });

  it('returns an empty list when .gitmodules is absent', async () => {
    fs.rmSync(path.join(tempDir, '.gitmodules'));
    const query = new SubmoduleQuery({ client: new MockGitClient() });

    await expect(query.list(tempDir)).resolves.toEqual([]);
  });
});
