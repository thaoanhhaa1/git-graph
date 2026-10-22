import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GitCliClient, GitRepository, RebasePlanQuery } from '../src/index';

describe('RebasePlanQuery - Integration with real Git', () => {
  let client: GitCliClient;
  let tempRepoDir: string;
  let repo: GitRepository;
  let shas: string[];

  beforeAll(async () => {
    const info = await GitCliClient.detect();
    client = new GitCliClient(info.path);

    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-rebase-plan-int-'));
    await client.exec(['init', '-b', 'main', tempRepoDir]);
    await client.exec(['config', 'user.name', 'Rebase Tester'], { cwd: tempRepoDir });
    await client.exec(['config', 'user.email', 'rebase@example.com'], { cwd: tempRepoDir });
    await client.exec(['config', 'commit.gpgsign', 'false'], { cwd: tempRepoDir });

    shas = [];
    for (let index = 1; index <= 4; index += 1) {
      fs.writeFileSync(path.join(tempRepoDir, 'file.txt'), `line ${index}\n`);
      await client.exec(['add', 'file.txt'], { cwd: tempRepoDir });
      await client.exec(['commit', '-m', `commit ${index}`], { cwd: tempRepoDir });
      const head = await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir });
      shas.push(head.stdout.trim());
    }

    repo = new GitRepository(
      {
        id: 'repo-1',
        rootPath: tempRepoDir,
        name: 'rebase-plan',
        gitDir: path.join(tempRepoDir, '.git'),
        isBare: false,
      },
      { client },
    );
  });

  afterAll(() => {
    fs.rmSync(tempRepoDir, { recursive: true, force: true });
  });

  it('lists commits after the target in oldest-first order', async () => {
    const entries = await repo.getRebasePlan(shas[1]!);

    expect(entries.map((entry) => entry.sha)).toEqual([shas[2], shas[3]]);
    expect(entries.map((entry) => entry.subject)).toEqual(['commit 3', 'commit 4']);
    expect(entries.every((entry) => entry.action === 'pick')).toBe(true);
    expect(entries[0]!.shortSha).toHaveLength(7);
    expect(entries[0]!.author).toBe('Rebase Tester');
  });

  it('accepts revision syntax and returns an empty plan for HEAD', async () => {
    const query = new RebasePlanQuery({ client });

    await expect(query.list(tempRepoDir, 'HEAD')).resolves.toEqual([]);
    const entries = await query.list(tempRepoDir, 'HEAD~2');
    expect(entries.map((entry) => entry.sha)).toEqual([shas[2], shas[3]]);
  });

  it('round-trips formatted plans through the todo parser', async () => {
    const entries = await repo.getRebasePlan(shas[1]!);
    const todo = RebasePlanQuery.formatTodo([
      { ...entries[0]!, action: 'pick' },
      { ...entries[1]!, action: 'squash' },
    ]);

    expect(
      RebasePlanQuery.parseTodo(todo).map(({ action, sha, subject }) => ({ action, sha, subject })),
    ).toEqual([
      { action: 'pick', sha: shas[2], subject: 'commit 3' },
      { action: 'squash', sha: shas[3], subject: 'commit 4' },
    ]);
  });

  it('rejects revisions that do not resolve to commits', async () => {
    await expect(repo.getRebasePlan('does-not-exist')).rejects.toThrow(
      'does not resolve to a commit',
    );
  });
});
