import { describe, expect, it } from 'vitest';
import type { GitClient, GitExecOptions, GitVersion } from '../src/client/GitClient';
import type { GitResult } from '../src/client/GitResult';
import { CommitQuery, decodeCursor, encodeCursor } from '../src/queries/CommitQuery';
import { RECORD_SEPARATOR, FIELD_SEPARATOR } from '../src/parsers/CommitLogParser';

class MockGitClient implements GitClient {
  public readonly gitPath = 'git';

  public async getVersion(): Promise<GitVersion> {
    return { raw: 'git version 2.40.0', major: 2, minor: 40, patch: 0 };
  }

  public executedCommands: { args: string[]; options?: GitExecOptions }[] = [];
  public mockResult: GitResult = {
    stdout: '',
    stderr: '',
    stdoutBuffer: Buffer.alloc(0),
    stderrBuffer: Buffer.alloc(0),
    exitCode: 0,
    durationMs: 5,
    command: 'git',
    args: [],
  };

  public async exec(args: readonly string[], options?: GitExecOptions): Promise<GitResult> {
    this.executedCommands.push({ args: [...args], options });
    return {
      ...this.mockResult,
      args: [...args],
    };
  }
}

function createDummyRecord(sha: string, subject: string): string {
  return [
    sha,
    sha.slice(0, 7),
    '',
    'Tester',
    'tester@example.com',
    '1710000000',
    '+00:00',
    'Tester',
    'tester@example.com',
    '1710000000',
    '+00:00',
    'HEAD -> main',
    subject,
  ].join(FIELD_SEPARATOR);
}

describe('CommitQuery - Unit Tests', () => {
  describe('encodeCursor & decodeCursor', () => {
    it('correctly encodes and decodes cursor offsets', () => {
      expect(encodeCursor(0)).toBe('0');
      expect(encodeCursor(50)).toBe('50');
      expect(decodeCursor('50')).toBe(50);
      expect(decodeCursor('0')).toBe(0);
      expect(decodeCursor(undefined)).toBe(0);
      expect(decodeCursor('invalid')).toBe(0);
      expect(decodeCursor('-10')).toBe(0);
    });
  });

  describe('queryCommits argument building', () => {
    it('respects AbortSignal and cancels execution', async () => {
      const mockClient = new MockGitClient();
      const query = new CommitQuery({ client: mockClient });
      const controller = new AbortController();
      controller.abort();

      const page = await query.queryCommits('/fake/repo', { signal: controller.signal });
      expect(page.commits).toHaveLength(0);
      expect(page.hasMore).toBe(false);
      // No commands executed because signal was already aborted
      expect(mockClient.executedCommands).toHaveLength(0);
    });

    it('constructs default arguments with --all, --date-order, and default limit 500 (+1)', async () => {
      const mockClient = new MockGitClient();
      const query = new CommitQuery({ client: mockClient });

      await query.queryCommits('/fake/repo');

      expect(mockClient.executedCommands).toHaveLength(1);
      const { args, options } = mockClient.executedCommands[0]!;
      expect(options?.cwd).toBe('/fake/repo');

      expect(args[0]).toBe('log');
      expect(args).toContain('--date-order');
      expect(args).toContain('--all');
      expect(args).toContain('-n501'); // limit 500 + 1 for pagination
      expect(args.some((a) => a.startsWith('--pretty=format:'))).toBe(true);
    });

    it('passes specific ref instead of --all when ref is provided', async () => {
      const mockClient = new MockGitClient();
      const query = new CommitQuery({ client: mockClient });

      await query.queryCommits('/fake/repo', { ref: 'feature/login' });

      const { args } = mockClient.executedCommands[0]!;
      expect(args).toContain('feature/login');
      expect(args).not.toContain('--all');
    });

    it('passes multiple refs when refs array is provided', async () => {
      const mockClient = new MockGitClient();
      const query = new CommitQuery({ client: mockClient });

      await query.queryCommits('/fake/repo', { refs: ['main', 'origin/dev'] });

      const { args } = mockClient.executedCommands[0]!;
      expect(args).toContain('main');
      expect(args).toContain('origin/dev');
      expect(args).not.toContain('--all');
    });

    it('includes pagination --skip and calculates correct -n limit', async () => {
      const mockClient = new MockGitClient();
      const query = new CommitQuery({ client: mockClient });

      await query.queryCommits('/fake/repo', { limit: 25, cursor: '50' });

      const { args } = mockClient.executedCommands[0]!;
      expect(args).toContain('-n26');
      expect(args).toContain('--skip=50');
    });

    it('passes author filter, date ranges, text query, and path filter', async () => {
      const mockClient = new MockGitClient();
      const query = new CommitQuery({ client: mockClient });

      await query.queryCommits('/fake/repo', {
        author: 'Alice',
        dateRange: {
          since: new Date('2024-01-01T00:00:00.000Z'),
          until: new Date('2024-06-01T00:00:00.000Z'),
        },
        textQuery: 'feat: init',
        path: 'src/components',
      });

      const { args } = mockClient.executedCommands[0]!;
      expect(args).toContain('--author=Alice');
      expect(args).toContain('--after=2024-01-01T00:00:00.000Z');
      expect(args).toContain('--before=2024-06-01T00:00:00.000Z');
      expect(args).toContain('--grep=feat: init');
      expect(args).toContain('-i');
      expect(args).toContain('--');
      expect(args).toContain('src/components');
    });

    it('supports commit ordering options (--topo-order, --author-date-order, --date-order)', async () => {
      const mockClient = new MockGitClient();
      const query = new CommitQuery({ client: mockClient });

      await query.queryCommits('/fake/repo', { order: 'topo-order' });
      expect(mockClient.executedCommands[0]!.args).toContain('--topo-order');
      expect(mockClient.executedCommands[0]!.args).not.toContain('--date-order');

      await query.queryCommits('/fake/repo', { order: 'author-date-order' });
      expect(mockClient.executedCommands[1]!.args).toContain('--author-date-order');
      expect(mockClient.executedCommands[1]!.args).not.toContain('--date-order');

      await query.queryCommits('/fake/repo', { order: 'date-order' });
      expect(mockClient.executedCommands[2]!.args).toContain('--date-order');
    });
  });

  describe('pagination and result handling', () => {
    it('sets hasMore=true and next cursor when more commits than limit exist', async () => {
      const mockClient = new MockGitClient();
      const limit = 2;
      // Generate 3 commits (limit + 1)
      const records = [
        createDummyRecord('1'.repeat(40), 'C1'),
        createDummyRecord('2'.repeat(40), 'C2'),
        createDummyRecord('3'.repeat(40), 'C3'),
      ];
      mockClient.mockResult = {
        ...mockClient.mockResult,
        stdout: `${RECORD_SEPARATOR}${records.join(`${RECORD_SEPARATOR}\n${RECORD_SEPARATOR}`)}${RECORD_SEPARATOR}`,
      };

      const query = new CommitQuery({ client: mockClient });
      const page = await query.queryCommits('/fake/repo', { limit, cursor: '0' });

      expect(page.commits).toHaveLength(2);
      expect(page.hasMore).toBe(true);
      expect(page.cursor).toBe('2');
      expect(page.commits[0]?.sha).toBe('1'.repeat(40));
      expect(page.commits[1]?.sha).toBe('2'.repeat(40));
    });

    it('sets hasMore=false and cursor=undefined when remaining commits <= limit', async () => {
      const mockClient = new MockGitClient();
      const records = [
        createDummyRecord('1'.repeat(40), 'C1'),
        createDummyRecord('2'.repeat(40), 'C2'),
      ];
      mockClient.mockResult = {
        ...mockClient.mockResult,
        stdout: `${RECORD_SEPARATOR}${records.join(`${RECORD_SEPARATOR}\n${RECORD_SEPARATOR}`)}${RECORD_SEPARATOR}`,
      };

      const query = new CommitQuery({ client: mockClient });
      const page = await query.queryCommits('/fake/repo', { limit: 5 });

      expect(page.commits).toHaveLength(2);
      expect(page.hasMore).toBe(false);
      expect(page.cursor).toBeUndefined();
    });

    it('handles empty repository (no commits yet) without throwing', async () => {
      const mockClient = new MockGitClient();
      mockClient.mockResult = {
        ...mockClient.mockResult,
        exitCode: 128,
        stderr: "fatal: your current branch 'main' does not have any commits yet",
      };

      const query = new CommitQuery({ client: mockClient });
      const page = await query.queryCommits('/fake/repo');

      expect(page.commits).toEqual([]);
      expect(page.hasMore).toBe(false);
    });
  });

  describe('getCommitDetails, getCommitBody, getCommitDiff', () => {
    it('getCommitDetails queries single commit with DETAILS_FORMAT including body', async () => {
      const mockClient = new MockGitClient();
      const sha = '4'.repeat(40);
      const detailRec = [
        sha,
        sha.slice(0, 7),
        '',
        'Author',
        'a@a.com',
        '1710000000',
        '+00:00',
        'Author',
        'a@a.com',
        '1710000000',
        '+00:00',
        '',
        'Commit with body',
        'This is the full detailed commit body\nwith multiline text.',
      ].join(FIELD_SEPARATOR);

      mockClient.mockResult = {
        ...mockClient.mockResult,
        stdout: `${RECORD_SEPARATOR}${detailRec}${RECORD_SEPARATOR}`,
      };

      const query = new CommitQuery({ client: mockClient });
      const commit = await query.getCommitDetails('/fake/repo', sha);

      expect(commit).not.toBeNull();
      expect(commit?.sha).toBe(sha);
      expect(commit?.body).toBe('This is the full detailed commit body\nwith multiline text.');

      const { args } = mockClient.executedCommands[0]!;
      expect(args[0]).toBe('log');
      expect(args[1]).toBe('-1');
      expect(args).toContain(sha);
    });

    it('getCommitBody executes log with %B format', async () => {
      const mockClient = new MockGitClient();
      mockClient.mockResult = {
        ...mockClient.mockResult,
        stdout: 'Release notes body\n\n- item 1',
      };

      const query = new CommitQuery({ client: mockClient });
      const body = await query.getCommitBody('/fake/repo', 'sha-123');

      expect(body).toBe('Release notes body\n\n- item 1');
      const { args } = mockClient.executedCommands[0]!;
      expect(args).toEqual(['log', '-1', '--pretty=format:%B', 'sha-123']);
    });

    it('getCommitDiff executes diff against parent or show for root commit', async () => {
      const mockClient = new MockGitClient();
      mockClient.mockResult = {
        ...mockClient.mockResult,
        stdout: 'diff --git a/file b/file\n...',
      };

      const query = new CommitQuery({ client: mockClient });

      // With parentSha
      await query.getCommitDiff('/fake/repo', 'commitB', 'commitA');
      expect(mockClient.executedCommands[0]!.args).toEqual(['diff', 'commitA', 'commitB']);

      // Without parentSha
      await query.getCommitDiff('/fake/repo', 'rootCommit');
      expect(mockClient.executedCommands[1]!.args).toEqual(['show', '--format=', 'rootCommit']);
    });

    it('handles searchType option correctly in queryCommits', async () => {
      const mockClient = new MockGitClient();
      const query = new CommitQuery({ client: mockClient });

      // searchType: author
      await query.queryCommits('/fake/repo', { textQuery: 'Bob', searchType: 'author' });
      expect(mockClient.executedCommands[0]!.args).toContain('--author=Bob');
      expect(mockClient.executedCommands[0]!.args).not.toContain('--grep=Bob');

      // searchType: subject
      await query.queryCommits('/fake/repo', { textQuery: 'feat', searchType: 'subject' });
      expect(mockClient.executedCommands[1]!.args).toContain('--grep=feat');
      expect(mockClient.executedCommands[1]!.args).not.toContain('--author=feat');

      // searchType: ref
      await query.queryCommits('/fake/repo', { textQuery: 'release', searchType: 'ref' });
      expect(mockClient.executedCommands[2]!.args).toContain('--glob=refs/*release*');

      // searchType: all (default)
      await query.queryCommits('/fake/repo', { textQuery: 'fix', searchType: 'all' });
      expect(mockClient.executedCommands[3]!.args).toContain('--grep=fix');
      expect(mockClient.executedCommands[3]!.args).toContain('--author=fix');
    });

    it('searchCommits searches by text query and resolves direct hash', async () => {
      const mockClient = new MockGitClient();
      const sha = 'a'.repeat(40);
      const record = createDummyRecord(sha, 'commit by hash');
      mockClient.mockResult = {
        ...mockClient.mockResult,
        stdout: `${RECORD_SEPARATOR}${record}${RECORD_SEPARATOR}`,
      };

      const query = new CommitQuery({ client: mockClient });
      const results = await query.searchCommits('/fake/repo', sha.slice(0, 8));

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.sha).toBe(sha);
    });
  });
});
