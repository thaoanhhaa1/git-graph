import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RebasePlanEntry } from '@git-graph/shared';
import { GitCliClient, GitRepository } from '@git-graph/git-core';
import { GitOperationService } from '../src/operations/GitOperationService';
import { RepositoryManager } from '../src/repositories/RepositoryManager';
import { RefreshCoordinator } from '../src/application/RefreshCoordinator';

interface TestRepo {
  dir: string;
  client: GitCliClient;
  repository: GitRepository;
  service: GitOperationService;
  shas: string[];
}

const createPlanEntry = (sha: string, action: RebasePlanEntry['action'], subject: string) => ({
  action,
  sha,
  shortSha: sha.slice(0, 7),
  subject,
  author: 'Rebase Tester',
  date: 0,
});

describe('GitOperationService interactive rebase - real Git', () => {
  let gitPath: string;
  let tempDirs: string[] = [];

  beforeAll(async () => {
    const info = await GitCliClient.detect();
    gitPath = info.path;
  });

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  const commitFile = async (client: GitCliClient, dir: string, name: string, content: string) => {
    fs.writeFileSync(path.join(dir, name), content);
    await client.exec(['add', name], { cwd: dir });
    await client.exec(['commit', '-m', `commit ${name}`], { cwd: dir });
    const result = await client.exec(['rev-parse', 'HEAD'], { cwd: dir });
    return result.stdout.trim();
  };

  const initRepo = async () => {
    const client = new GitCliClient(gitPath);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-interactive-'));
    tempDirs.push(dir);

    await client.exec(['init', '-b', 'main', dir]);
    await client.exec(['config', 'user.name', 'Rebase Tester'], { cwd: dir });
    await client.exec(['config', 'user.email', 'rebase@example.com'], { cwd: dir });
    await client.exec(['config', 'commit.gpgsign', 'false'], { cwd: dir });
    await client.exec(['config', 'rebase.autoSquash', 'false'], { cwd: dir });

    const repository = new GitRepository(
      {
        id: 'repo-1',
        name: 'interactive-test',
        rootPath: dir,
        gitDir: path.join(dir, '.git'),
        isBare: false,
      },
      { client },
    );

    const repositoryManager = new RepositoryManager();
    vi.spyOn(repositoryManager, 'getRepository').mockImplementation((id: string) =>
      id === 'repo-1' ? repository : undefined,
    );
    const service = new GitOperationService({
      repositoryManager,
      refreshCoordinator: new RefreshCoordinator(),
    });

    return { dir, client, repository, service };
  };

  const createRepo = async (): Promise<TestRepo> => {
    const context = await initRepo();
    const { dir, client } = context;

    const baseSha = await commitFile(client, dir, 'base.txt', 'base\n');
    const firstSha = await commitFile(client, dir, 'first.txt', 'first\n');
    const secondSha = await commitFile(client, dir, 'second.txt', 'second\n');
    const thirdSha = await commitFile(client, dir, 'third.txt', 'third\n');

    return {
      ...context,
      shas: [baseSha, firstSha, secondSha, thirdSha],
    };
  };

  const createConflictRepo = async () => {
    const context = await initRepo();
    const { dir, client } = context;

    fs.writeFileSync(path.join(dir, 'base.txt'), 'base\n');
    fs.writeFileSync(path.join(dir, 'conflict.txt'), 'base\n');
    await client.exec(['add', '.'], { cwd: dir });
    await client.exec(['commit', '-m', 'base commit'], { cwd: dir });

    await client.exec(['checkout', '-b', 'topic'], { cwd: dir });
    fs.writeFileSync(path.join(dir, 'conflict.txt'), 'first\n');
    await client.exec(['add', 'conflict.txt'], { cwd: dir });
    await client.exec(['commit', '-m', 'first conflict change'], { cwd: dir });
    const firstSha = (await client.exec(['rev-parse', 'HEAD'], { cwd: dir })).stdout.trim();

    fs.writeFileSync(path.join(dir, 'conflict.txt'), 'second\n');
    await client.exec(['add', 'conflict.txt'], { cwd: dir });
    await client.exec(['commit', '-m', 'second conflict change'], { cwd: dir });
    const secondSha = (await client.exec(['rev-parse', 'HEAD'], { cwd: dir })).stdout.trim();

    await client.exec(['checkout', 'main'], { cwd: dir });
    fs.writeFileSync(path.join(dir, 'conflict.txt'), 'main\n');
    await client.exec(['add', 'conflict.txt'], { cwd: dir });
    await client.exec(['commit', '-m', 'main conflict change'], { cwd: dir });
    const ontoSha = (await client.exec(['rev-parse', 'HEAD'], { cwd: dir })).stdout.trim();

    await client.exec(['checkout', 'topic'], { cwd: dir });

    return { ...context, firstSha, secondSha, ontoSha };
  };

  const logSubjects = async (client: GitCliClient, dir: string) => {
    const result = await client.exec(['log', '--format=%s'], { cwd: dir });
    return result.stdout.trim().split('\n');
  };

  it('squashes three commits into one using the sequence editor', async () => {
    const { dir, client, service, shas } = await createRepo();
    const plan = [
      createPlanEntry(shas[3]!, 'squash', 'commit third.txt'),
      createPlanEntry(shas[2]!, 'squash', 'commit second.txt'),
      createPlanEntry(shas[1]!, 'pick', 'commit first.txt'),
    ];

    const result = await service.interactiveRebase({
      operationId: 'op-squash',
      repositoryId: 'repo-1',
      onto: shas[0]!,
      plan,
    });

    expect(result.success).toBe(true);
    expect(result.data?.rebaseState.inProgress).toBe(false);
    const count = await client.exec(['rev-list', '--count', 'HEAD'], { cwd: dir });
    expect(count.stdout.trim()).toBe('2');
    const bodies = await client.exec(['log', '--format=%B'], { cwd: dir });
    expect(bodies.stdout).toContain('commit first.txt');
    expect(bodies.stdout).toContain('commit second.txt');
    expect(bodies.stdout).toContain('commit third.txt');
  });

  it('applies a reword message from the message editor script', async () => {
    const { dir, client, service, shas } = await createRepo();
    const plan = [
      createPlanEntry(shas[3]!, 'pick', 'commit third.txt'),
      createPlanEntry(shas[2]!, 'pick', 'commit second.txt'),
      {
        ...createPlanEntry(shas[1]!, 'reword', 'commit first.txt'),
        message: 'rewritten first commit',
      },
    ];

    const result = await service.interactiveRebase({
      operationId: 'op-reword',
      repositoryId: 'repo-1',
      onto: shas[0]!,
      plan,
    });

    expect(result.success).toBe(true);
    const subjects = await logSubjects(client, dir);
    expect(subjects.slice(0, 3)).toEqual([
      'commit third.txt',
      'commit second.txt',
      'rewritten first commit',
    ]);
  });

  it('stops on conflict, reports rebase state, and continues after resolution', async () => {
    const { dir, client, service, firstSha, secondSha, ontoSha } = await createConflictRepo();

    const plan = [
      createPlanEntry(secondSha, 'squash', 'second conflict change'),
      createPlanEntry(firstSha, 'pick', 'first conflict change'),
    ];

    const conflictResult = await service.interactiveRebase({
      operationId: 'op-conflict',
      repositoryId: 'repo-1',
      onto: ontoSha,
      plan,
    });

    expect(conflictResult.success).toBe(false);
    expect(conflictResult.error?.message).toContain('Interactive rebase stopped with conflicts');
    const conflictState = (
      conflictResult.error?.details as {
        rebaseState: { inProgress: boolean; unmergedFiles: string[] };
      }
    ).rebaseState;
    expect(conflictState.inProgress).toBe(true);
    expect(conflictState.unmergedFiles).toContain('conflict.txt');

    fs.writeFileSync(path.join(dir, 'conflict.txt'), 'first\n');
    await client.exec(['add', 'conflict.txt'], { cwd: dir });

    const continueResult = await service.continueRebase({
      operationId: 'op-continue',
      repositoryId: 'repo-1',
    });

    expect(continueResult.success).toBe(true);
    expect(continueResult.data?.rebaseState.inProgress).toBe(false);
    const bodies = await client.exec(['log', '--format=%B'], { cwd: dir });
    expect(bodies.stdout).toContain('first conflict change');
    expect(bodies.stdout).toContain('second conflict change');
  });

  it('aborts an interactive rebase and restores the original branch', async () => {
    const { dir, client, service, firstSha, secondSha, ontoSha } = await createConflictRepo();
    const originalHead = secondSha;

    const conflictResult = await service.interactiveRebase({
      operationId: 'op-conflict-abort',
      repositoryId: 'repo-1',
      onto: ontoSha,
      plan: [
        createPlanEntry(secondSha, 'squash', 'second conflict change'),
        createPlanEntry(firstSha, 'pick', 'first conflict change'),
      ],
    });
    expect(conflictResult.success).toBe(false);

    const abortResult = await service.abortRebase({
      operationId: 'op-abort',
      repositoryId: 'repo-1',
    });

    expect(abortResult.success).toBe(true);
    expect(abortResult.data?.rebaseState.inProgress).toBe(false);
    const head = await client.exec(['rev-parse', 'HEAD'], { cwd: dir });
    expect(head.stdout.trim()).toBe(originalHead);
    expect(fs.readFileSync(path.join(dir, 'conflict.txt'), 'utf8')).toBe('second\n');
  });

  it('rejects a plan whose first applied commit is a squash', async () => {
    const { service, shas } = await createRepo();

    const result = await service.interactiveRebase({
      operationId: 'op-invalid',
      repositoryId: 'repo-1',
      onto: shas[0]!,
      plan: [createPlanEntry(shas[1]!, 'squash', 'commit first.txt')],
    });

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('first applied commit cannot be squashed');
  });
});
