import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BlameResultSchema, LineHistoryResultSchema } from '@git-graph/shared';
import { GitCliClient, GitRepository } from '../src/index';

describe('BlameQuery & LineHistoryQuery - Integration with real Git', () => {
  let client: GitCliClient;
  let tempRepoDir: string;
  let repo: GitRepository;

  beforeAll(async () => {
    const info = await GitCliClient.detect();
    client = new GitCliClient(info.path);

    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-blame-int-'));
    await client.exec(['init', '-b', 'main', tempRepoDir]);
    await client.exec(['config', 'user.name', 'Blame Tester'], { cwd: tempRepoDir });
    await client.exec(['config', 'user.email', 'blame@example.com'], { cwd: tempRepoDir });
    await client.exec(['config', 'commit.gpgsign', 'false'], { cwd: tempRepoDir });

    fs.writeFileSync(
      path.join(tempRepoDir, 'old.ts'),
      'line one\nline two\nline three\nline four\nline five\nline six\nline seven\nline eight\n',
    );
    await client.exec(['add', '.'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'feat: initial file'], {
      cwd: tempRepoDir,
      env: {
        GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
      },
    });

    await client.exec(['mv', 'old.ts', 'new.ts'], { cwd: tempRepoDir });
    fs.writeFileSync(
      path.join(tempRepoDir, 'new.ts'),
      'line one\nline two changed\nline three\nline four\nline five\nline six\nline seven\nline eight\n',
    );
    await client.exec(['commit', '-am', 'feat: rename and update'], {
      cwd: tempRepoDir,
      env: {
        GIT_AUTHOR_DATE: '2020-02-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2020-02-01T00:00:00Z',
      },
    });

    fs.writeFileSync(
      path.join(tempRepoDir, 'new.ts'),
      'line one changed\nline two changed\nline three\nline four\nline five\nline six\nline seven\nline eight changed\n',
    );
    await client.exec(['commit', '-am', 'feat: update edges'], {
      cwd: tempRepoDir,
      env: {
        GIT_AUTHOR_DATE: '2020-03-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2020-03-01T00:00:00Z',
      },
    });

    repo = new GitRepository(
      {
        id: 'repo-blame',
        rootPath: tempRepoDir,
        name: 'repo-blame',
        gitDir: path.join(tempRepoDir, '.git'),
        isBare: false,
      },
      { client },
    );
  });

  afterAll(() => {
    fs.rmSync(tempRepoDir, { recursive: true, force: true });
  });

  it('returns blame metadata and follows renames', async () => {
    const result = await repo.getBlame('new.ts');

    expect(result.lines).toHaveLength(8);
    expect(result.lines[0]?.content).toBe('line one changed');
    expect(result.lines[1]?.content).toBe('line two changed');
    expect(result.lines[2]?.content).toBe('line three');
    expect(result.lines[7]?.content).toBe('line eight changed');
    expect(result.lines[0]?.subject).toBe('feat: update edges');
    expect(result.lines[1]?.subject).toBe('feat: rename and update');
    expect(result.lines[2]?.subject).toBe('feat: initial file');
    expect(result.lines[2]?.author).toBe('Blame Tester');
    expect(result.lines[2]?.timestamp).toBe(1577836800);
    expect(BlameResultSchema.safeParse(result).success).toBe(true);
  });

  it('returns line history across a rename with multi-hunk diffs', async () => {
    const result = await repo.getLineHistory('new.ts', 1, 8);

    expect(result.entries.length).toBeGreaterThanOrEqual(3);
    expect(result.entries[0]?.subject).toBe('feat: update edges');
    expect(result.entries[0]?.diff).toContain('+line one changed');
    expect(result.entries[0]?.diff).toContain('+line eight changed');
    expect(result.entries[0]?.diff.match(/^@@/gm)?.length).toBeGreaterThanOrEqual(1);
    expect(
      result.entries.find((entry) => entry.subject === 'feat: rename and update')?.filePath,
    ).toBe('new.ts');
    expect(result.entries.find((entry) => entry.subject === 'feat: initial file')?.filePath).toBe(
      'old.ts',
    );
    expect(LineHistoryResultSchema.safeParse(result).success).toBe(true);
  });
});
