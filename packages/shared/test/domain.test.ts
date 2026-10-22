import { describe, it, expect } from 'vitest';
import {
  RepositoryDescriptorSchema,
  CommitSchema,
  CommitPageSchema,
  GraphRowSchema,
  GraphSegmentSchema,
  GitRefSchema,
  FileChangeSchema,
  CommitStatsSchema,
  CommitDetailsSchema,
  DiffResultSchema,
  type Commit,
  type GraphRow,
  type FileChange,
  type CommitStats,
  type CommitDetails,
  type DiffResult,
  WorktreeStatusSchema,
  StashEntrySchema,
  RebasePlanEntrySchema,
  validateRebasePlan,
} from '../src/index';

describe('Domain Models and Schemas', () => {
  it('validates RepositoryDescriptor correctly', () => {
    const validRepo = {
      id: 'repo-1',
      rootPath: '/path/to/repo',
      name: 'my-repo',
      gitDir: '/path/to/repo/.git',
      isBare: false,
    };

    const parsed = RepositoryDescriptorSchema.safeParse(validRepo);
    expect(parsed.success).toBe(true);

    const invalidRepo = {
      id: '',
      rootPath: '/path/to/repo',
    };
    expect(RepositoryDescriptorSchema.safeParse(invalidRepo).success).toBe(false);
  });

  it('validates Commit, GitIdentity, and GitRef', () => {
    const validCommit: Commit = {
      sha: 'abcdef1234567890abcdef1234567890abcdef12',
      shortSha: 'abcdef1',
      parents: ['1234567890abcdef1234567890abcdef12345678'],
      author: {
        name: 'Alice Developer',
        email: 'alice@example.com',
        timestamp: 1710000000,
        timezone: '+0700',
      },
      committer: {
        name: 'Alice Developer',
        email: 'alice@example.com',
        timestamp: 1710000000,
        timezone: '+0700',
      },
      subject: 'feat: add git graph core engine',
      body: 'Detailed description of the commit',
      refs: [
        {
          name: 'HEAD',
          fullName: 'HEAD',
          target: 'abcdef1234567890abcdef1234567890abcdef12',
          kind: 'head',
          isCurrent: true,
        },
        {
          name: 'main',
          fullName: 'refs/heads/main',
          target: 'abcdef1234567890abcdef1234567890abcdef12',
          kind: 'localBranch',
        },
      ],
    };

    const parsed = CommitSchema.safeParse(validCommit);
    expect(parsed.success).toBe(true);

    const invalidRef = {
      name: 'invalid-kind-ref',
      fullName: 'refs/test',
      target: 'abc',
      kind: 'unknown-kind',
    };
    expect(GitRefSchema.safeParse(invalidRef).success).toBe(false);
  });

  it('validates CommitPage with hasMore and cursor', () => {
    const page = {
      commits: [],
      hasMore: false,
      cursor: 'cursor-token-123',
    };

    const parsed = CommitPageSchema.safeParse(page);
    expect(parsed.success).toBe(true);
  });

  it('validates extended GitRef properties and RepositoryRefsResult', () => {
    const annotatedTag = {
      name: 'v1.0.0',
      fullName: 'refs/tags/v1.0.0',
      target: 'abcdef1234567890abcdef1234567890abcdef12',
      kind: 'tag',
      tagType: 'annotated',
      tagObjectSha: '1111111111111111111111111111111111111111',
    };
    expect(GitRefSchema.safeParse(annotatedTag).success).toBe(true);

    const remoteBranch = {
      name: 'origin/main',
      fullName: 'refs/remotes/origin/main',
      target: 'abcdef1234567890abcdef1234567890abcdef12',
      kind: 'remoteBranch',
      isSymbolic: false,
    };
    expect(GitRefSchema.safeParse(remoteBranch).success).toBe(true);

    const symbolicRef = {
      name: 'origin/HEAD',
      fullName: 'refs/remotes/origin/HEAD',
      target: 'abcdef1234567890abcdef1234567890abcdef12',
      kind: 'remoteBranch',
      isSymbolic: true,
      symrefTarget: 'refs/remotes/origin/main',
    };
    expect(GitRefSchema.safeParse(symbolicRef).success).toBe(true);

    const localBranchWithUpstream = {
      name: 'feature',
      fullName: 'refs/heads/feature',
      target: 'abcdef1234567890abcdef1234567890abcdef12',
      kind: 'localBranch',
      isCurrent: true,
      upstream: 'origin/feature',
    };
    expect(GitRefSchema.safeParse(localBranchWithUpstream).success).toBe(true);
  });

  it('validates GraphRow and GraphSegment with strict coordinates', () => {
    const segment = {
      fromRow: 0,
      fromLane: 0,
      toRow: 1,
      toLane: 0,
      kind: 'straight' as const,
      colorIndex: 1,
    };
    expect(GraphSegmentSchema.safeParse(segment).success).toBe(true);

    const invalidSegment = {
      fromRow: -1, // must be nonnegative
      fromLane: 0,
      toRow: 1,
      toLane: 0,
      kind: 'invalid-kind',
      colorIndex: 0,
    };
    expect(GraphSegmentSchema.safeParse(invalidSegment).success).toBe(false);

    const validRow: GraphRow = {
      commit: {
        sha: 'abc',
        shortSha: 'abc',
        parents: [],
        author: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: 'Z' },
        committer: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: 'Z' },
        subject: 'init',
        refs: [],
      },
      row: 0,
      lane: 0,
      segments: [segment],
      maxLane: 1,
    };

    expect(GraphRowSchema.safeParse(validRow).success).toBe(true);
  });

  it('validates FileChangeSchema and CommitStatsSchema', () => {
    const textChange: FileChange = {
      path: 'src/index.ts',
      status: 'modified',
      additions: 12,
      deletions: 3,
      isBinary: false,
    };
    expect(FileChangeSchema.safeParse(textChange).success).toBe(true);

    const renamedChange: FileChange = {
      path: 'new/path.ts',
      oldPath: 'old/path.ts',
      status: 'renamed',
      additions: 0,
      deletions: 0,
      isBinary: false,
      similarity: 100,
    };
    expect(FileChangeSchema.safeParse(renamedChange).success).toBe(true);

    const binaryChange: FileChange = {
      path: 'assets/logo.png',
      status: 'added',
      isBinary: true,
    };
    expect(FileChangeSchema.safeParse(binaryChange).success).toBe(true);

    const stats: CommitStats = {
      filesChanged: 3,
      additions: 12,
      deletions: 3,
    };
    expect(CommitStatsSchema.safeParse(stats).success).toBe(true);

    const invalidChange = {
      path: '',
      status: 'non-existent-status',
      isBinary: false,
    };
    expect(FileChangeSchema.safeParse(invalidChange).success).toBe(false);
  });

  it('validates CommitDetailsSchema and DiffResultSchema', () => {
    const commitDetails: CommitDetails = {
      commit: {
        sha: 'a'.repeat(40),
        shortSha: 'aaaaaaa',
        parents: ['b'.repeat(40)],
        author: { name: 'Dev', email: 'dev@example.com', timestamp: 100, timezone: 'Z' },
        committer: { name: 'Dev', email: 'dev@example.com', timestamp: 100, timezone: 'Z' },
        subject: 'feat: add details',
        refs: [],
      },
      fileChanges: [
        {
          path: 'file.txt',
          status: 'added',
          additions: 5,
          deletions: 0,
          isBinary: false,
        },
      ],
      stats: {
        filesChanged: 1,
        additions: 5,
        deletions: 0,
      },
    };
    expect(CommitDetailsSchema.safeParse(commitDetails).success).toBe(true);

    const diffResult: DiffResult = {
      diff: '--- a/file.txt\n+++ b/file.txt\n@@ -0,0 +1,5 @@\n+hello\n',
      isTruncated: false,
      isBinary: false,
      totalBytes: 54,
    };
    expect(DiffResultSchema.safeParse(diffResult).success).toBe(true);

    const truncatedDiff: DiffResult = {
      diff: 'diff content truncated',
      isTruncated: true,
      isBinary: false,
      truncatedBytes: 1024,
      totalBytes: 50000,
    };
    expect(DiffResultSchema.safeParse(truncatedDiff).success).toBe(true);
  });
});

describe('Worktree & Stash domain schemas', () => {
  it('validates WorktreeStatus with staged and unstaged files', () => {
    const status = {
      isClean: false,
      staged: [
        {
          path: 'src/index.ts',
          status: 'modified',
          indexStatus: 'M',
          worktreeStatus: ' ',
          staged: true,
          unstaged: false,
        },
      ],
      unstaged: [
        {
          path: 'README.md',
          status: 'untracked',
          indexStatus: '?',
          worktreeStatus: '?',
          staged: false,
          unstaged: true,
        },
      ],
      hasConflicts: false,
      head: { sha: 'a'.repeat(40), subject: 'feat: previous', body: '' },
      currentBranch: 'main',
    };

    expect(WorktreeStatusSchema.safeParse(status).success).toBe(true);

    const invalid = { ...status, isClean: 'no' };
    expect(WorktreeStatusSchema.safeParse(invalid).success).toBe(false);
  });

  it('validates StashEntry', () => {
    const entry = {
      index: 0,
      ref: 'stash@{0}',
      sha: 'b'.repeat(40),
      message: 'WIP on main: abc123 feat',
      branch: 'main',
      author: 'Ada',
      timestamp: 1700000000000,
    };
    expect(StashEntrySchema.safeParse(entry).success).toBe(true);
    expect(StashEntrySchema.safeParse({ ...entry, index: -1 }).success).toBe(false);
  });

  it('validates RebasePlanEntry and rejects non-hexadecimal SHAs', () => {
    const entry = {
      action: 'pick',
      sha: 'a'.repeat(40),
      shortSha: 'aaaaaaa',
      subject: 'feat: initial',
      author: 'Ada',
      date: 1700000000,
    };

    expect(RebasePlanEntrySchema.safeParse(entry).success).toBe(true);
    expect(RebasePlanEntrySchema.safeParse({ ...entry, action: 'explode' }).success).toBe(false);
    expect(RebasePlanEntrySchema.safeParse({ ...entry, sha: 'xyz123' }).success).toBe(false);
    expect(
      RebasePlanEntrySchema.safeParse({ ...entry, action: 'reword', message: 'new' }).success,
    ).toBe(true);
  });

  it('validates rebase plans in execution order', () => {
    const pick = {
      action: 'pick' as const,
      sha: 'a'.repeat(40),
      shortSha: 'aaaaaaa',
      subject: 'first',
      author: 'Ada',
      date: 0,
    };
    const squash = {
      ...pick,
      action: 'squash' as const,
      sha: 'b'.repeat(40),
      shortSha: 'bbbbbbb',
      subject: 'second',
    };

    expect(validateRebasePlan([pick, squash])).toEqual({ valid: true });
    expect(validateRebasePlan([])).toEqual({
      valid: false,
      error: 'The rebase plan is empty.',
    });
    expect(validateRebasePlan([squash, pick])).toEqual({
      valid: false,
      error: 'The first applied commit cannot be squashed or fixed up.',
    });
    expect(validateRebasePlan([pick, { ...pick }])).toEqual({
      valid: false,
      error: 'Commit aaaaaaa appears more than once.',
    });

    const reword = {
      ...pick,
      action: 'reword' as const,
      sha: 'c'.repeat(40),
      shortSha: 'ccccccc',
      message: '   ',
    };
    expect(validateRebasePlan([pick, reword])).toEqual({
      valid: false,
      error: 'Commit ccccccc needs a message before it can be reworded.',
    });
    expect(validateRebasePlan([pick, { ...reword, message: 'new message' }])).toEqual({
      valid: true,
    });

    const drop = {
      ...pick,
      action: 'drop' as const,
      sha: 'd'.repeat(40),
      shortSha: 'ddddddd',
    };
    expect(validateRebasePlan([drop, pick, squash])).toEqual({ valid: true });
  });
});
