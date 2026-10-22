import { describe, it, expect } from 'vitest';
import {
  createMessage,
  createErrorMessage,
  safeParseWebviewMessage,
  safeParseExtensionMessage,
  safeParseMessage,
  ProtocolMessageSchema,
  AppErrorCode,
  type AppBootstrapPayload,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  clampPageSize,
  measureSerialization,
  measureDeserialization,
  splitCommitPageIntoChunks,
  type Commit,
  type CommitPage,
} from '../src/index';

describe('Protocol Messages and Schemas', () => {
  describe('createMessage helper', () => {
    it('creates standard message envelope with protocolVersion: 1 and unique id', () => {
      const msg = createMessage('app.ready', { timestamp: 12345 });
      expect(msg.protocolVersion).toBe(1);
      expect(msg.type).toBe('app.ready');
      expect(msg.payload).toEqual({ timestamp: 12345 });
      expect(typeof msg.id).toBe('string');
      expect(msg.id.length).toBeGreaterThan(0);
    });

    it('supports custom id and requestId for request-response tracking', () => {
      const msg = createMessage(
        'commits.page.result',
        {
          repositoryId: 'repo-1',
          page: { commits: [], hasMore: false },
        },
        { id: 'custom-msg-id', requestId: 'req-456' },
      );

      expect(msg.id).toBe('custom-msg-id');
      expect(msg.requestId).toBe('req-456');
      expect(msg.type).toBe('commits.page.result');
    });

    it('creates standardized error message via createErrorMessage', () => {
      const errMsg = createErrorMessage(
        'Git executable not found in PATH',
        AppErrorCode.GIT_NOT_FOUND,
        { hint: 'Install git' },
        'req-git-init',
      );

      expect(errMsg.type).toBe('notification.error');
      expect(errMsg.payload.code).toBe('GIT_NOT_FOUND');
      expect(errMsg.payload.message).toBe('Git executable not found in PATH');
      expect(errMsg.payload.details).toEqual({ hint: 'Install git' });
      expect(errMsg.payload.requestId).toBe('req-git-init');
      expect(errMsg.requestId).toBe('req-git-init');
    });
  });

  describe('safeParseWebviewMessage validation', () => {
    it('successfully parses valid app.ready message', () => {
      const raw = {
        protocolVersion: 1,
        id: 'msg-1',
        type: 'app.ready',
        payload: { timestamp: 1710000000 },
      };

      const result = safeParseWebviewMessage(raw);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('app.ready');
        if (result.data.type === 'app.ready') {
          expect(result.data.payload.timestamp).toBe(1710000000);
        }
      }
    });

    it('successfully parses repository.select and commits.page.request', () => {
      const selectMsg = {
        protocolVersion: 1,
        id: 'msg-2',
        type: 'repository.select',
        payload: { repositoryId: 'repo-abc' },
      };
      expect(safeParseWebviewMessage(selectMsg).success).toBe(true);

      const commitsRequestMsg = {
        protocolVersion: 1,
        id: 'msg-3',
        type: 'commits.page.request',
        payload: {
          repositoryId: 'repo-abc',
          limit: 50,
          branch: 'main',
        },
      };
      expect(safeParseWebviewMessage(commitsRequestMsg).success).toBe(true);
    });

    it('validates graph.reveal.commit messages from the extension', () => {
      const valid = {
        protocolVersion: 1,
        id: 'reveal-1',
        type: 'graph.reveal.commit',
        payload: { sha: 'abcdef1234567890abcdef1234567890abcdef12', repositoryId: 'repo-1' },
      };
      expect(safeParseExtensionMessage(valid).success).toBe(true);

      const invalid = { ...valid, payload: { sha: '' } };
      expect(safeParseExtensionMessage(invalid).success).toBe(false);
    });

    it('validates typed checkout requests', () => {
      const validCheckout = createMessage('operation.checkout.request', {
        repositoryId: 'repo-abc',
        target: 'refs/remotes/origin/feature',
        targetType: 'remoteBranch',
        localBranchName: 'feature',
      });
      expect(safeParseWebviewMessage(validCheckout).success).toBe(true);

      const invalidCheckout = createMessage('operation.checkout.request', {
        repositoryId: 'repo-abc',
        target: 'main',
        targetType: 'not-a-ref-kind',
      });
      expect(safeParseWebviewMessage(invalidCheckout).success).toBe(false);
    });

    it('validates create branch requests and checkout intent', () => {
      const validCreateBranch = createMessage('operation.branch.create.request', {
        repositoryId: 'repo-abc',
        name: 'feature/safe',
        startPoint: 'abcdef1234567',
        checkout: true,
      });
      expect(safeParseWebviewMessage(validCreateBranch).success).toBe(true);

      const promptForName = createMessage('operation.branch.create.request', {
        repositoryId: 'repo-abc',
        startPoint: 'abcdef1234567',
      });
      expect(safeParseWebviewMessage(promptForName).success).toBe(true);

      const invalidCreateBranch = createMessage('operation.branch.create.request', {
        repositoryId: 'repo-abc',
        name: '',
        checkout: 'yes',
      });
      expect(safeParseWebviewMessage(invalidCreateBranch).success).toBe(false);
    });

    it('validates create tag requests and future annotated tag fields', () => {
      const lightweightTag = createMessage('operation.tag.create.request', {
        repositoryId: 'repo-abc',
        target: 'abcdef1234567',
      });
      expect(safeParseWebviewMessage(lightweightTag).success).toBe(true);

      const annotatedTag = createMessage('operation.tag.create.request', {
        repositoryId: 'repo-abc',
        name: 'v1.0.0',
        target: 'abcdef1234567',
        tagType: 'annotated',
        message: 'Version 1.0.0',
      });
      expect(safeParseWebviewMessage(annotatedTag).success).toBe(true);

      const invalidTag = createMessage('operation.tag.create.request', {
        repositoryId: 'repo-abc',
        target: 'abcdef1234567',
        tagType: 'signed',
      });
      expect(safeParseWebviewMessage(invalidTag).success).toBe(false);

      const pushedTag = createMessage('operation.tag.create.request', {
        repositoryId: 'repo-abc',
        name: 'v1.0.0',
        target: 'abcdef1234567',
        tagType: 'annotated',
        message: 'Version 1.0.0',
        pushToRemote: true,
        remote: 'origin',
      });
      expect(safeParseWebviewMessage(pushedTag).success).toBe(true);
    });

    it('validates delete tag requests', () => {
      const localDelete = createMessage('operation.tag.delete.request', {
        repositoryId: 'repo-abc',
        tagName: 'v1.0.0',
      });
      expect(safeParseWebviewMessage(localDelete).success).toBe(true);

      const remoteDelete = createMessage('operation.tag.delete.request', {
        repositoryId: 'repo-abc',
        tagName: 'v1.0.0',
        deleteOnRemote: true,
        remote: 'origin',
      });
      expect(safeParseWebviewMessage(remoteDelete).success).toBe(true);

      const invalidDelete = createMessage('operation.tag.delete.request', {
        repositoryId: 'repo-abc',
        tagName: '',
      });
      expect(safeParseWebviewMessage(invalidDelete).success).toBe(false);
    });

    it('validates merge and merge abort operation requests', () => {
      const mergeRequest = createMessage('operation.merge.request', {
        repositoryId: 'repo-abc',
        target: 'feature/safe',
        fastForwardMode: 'no-ff',
      });
      expect(safeParseWebviewMessage(mergeRequest).success).toBe(true);

      const noCommitMerge = createMessage('operation.merge.request', {
        repositoryId: 'repo-abc',
        target: 'feature/safe',
        fastForwardMode: 'ff-only',
        noCommit: true,
      });
      expect(safeParseWebviewMessage(noCommitMerge).success).toBe(true);

      const promptForPolicy = createMessage('operation.merge.request', {
        repositoryId: 'repo-abc',
        target: 'feature/safe',
      });
      expect(safeParseWebviewMessage(promptForPolicy).success).toBe(true);

      const invalidMerge = createMessage('operation.merge.request', {
        repositoryId: 'repo-abc',
        target: 'feature/safe',
        fastForwardMode: 'squash',
      });
      expect(safeParseWebviewMessage(invalidMerge).success).toBe(false);

      const abortRequest = createMessage('operation.merge.abort.request', {
        repositoryId: 'repo-abc',
      });
      expect(safeParseWebviewMessage(abortRequest).success).toBe(true);
    });

    it('validates rebase and rebase action operation requests', () => {
      const rebaseRequest = createMessage('operation.rebase.request', {
        repositoryId: 'repo-abc',
        target: 'feature/safe',
        confirmedPublishedBranch: true,
      });
      expect(safeParseWebviewMessage(rebaseRequest).success).toBe(true);

      const ignoreDateRebase = createMessage('operation.rebase.request', {
        repositoryId: 'repo-abc',
        target: 'feature/safe',
        ignoreDate: true,
        noConfirm: true,
      });
      expect(safeParseWebviewMessage(ignoreDateRebase).success).toBe(true);

      const invalidRebase = createMessage('operation.rebase.request', {
        repositoryId: 'repo-abc',
        target: '',
      });
      expect(safeParseWebviewMessage(invalidRebase).success).toBe(false);

      for (const type of [
        'operation.rebase.continue.request',
        'operation.rebase.abort.request',
        'operation.rebase.skip.request',
      ] as const) {
        const actionRequest = createMessage(type, {
          repositoryId: 'repo-abc',
        });
        expect(safeParseWebviewMessage(actionRequest).success).toBe(true);
      }
    });

    it('safely rejects invalid messages without throwing or crashing', () => {
      const malformedCases = [
        null,
        undefined,
        'not an object',
        {},
        { protocolVersion: 2, id: '1', type: 'app.ready', payload: {} }, // wrong protocol version
        { protocolVersion: 1, id: '1', type: 'unknown.action', payload: {} }, // unknown type
        { protocolVersion: 1, id: '1', type: 'repository.select', payload: {} }, // missing repositoryId
        { protocolVersion: 1, id: '', type: 'repository.select', payload: { repositoryId: 'r1' } }, // empty id
      ];

      for (const malformed of malformedCases) {
        expect(() => {
          const res = safeParseWebviewMessage(malformed);
          expect(res.success).toBe(false);
          if (!res.success) {
            expect(res.error.code).toBe(AppErrorCode.INVALID_MESSAGE);
            expect(res.error.message).toContain('Protocol validation failed');
          }
        }).not.toThrow();
      }
    });

    it('validates file.openRevision.request and diff.open.request messages', () => {
      const openRevMsg = createMessage('file.openRevision.request', {
        repositoryId: 'repo-abc',
        sha: 'abc1234',
        filePath: 'src/index.ts',
      });
      expect(safeParseWebviewMessage(openRevMsg).success).toBe(true);

      const invalidOpenRev = createMessage('file.openRevision.request', {
        repositoryId: '',
        filePath: '',
      });
      expect(safeParseWebviewMessage(invalidOpenRev).success).toBe(false);

      const openDiffMsg = createMessage('diff.open.request', {
        repositoryId: 'repo-abc',
        sha: 'abc1234',
        filePath: 'src/index.ts',
      });
      expect(safeParseWebviewMessage(openDiffMsg).success).toBe(true);
    });
  });

  describe('safeParseExtensionMessage validation', () => {
    it('successfully parses valid app.bootstrap message', () => {
      const bootstrapPayload: AppBootstrapPayload = {
        protocolVersion: 1,
        repositories: [{ id: 'r1', name: 'Repo 1', path: '/r1', currentBranch: 'main' }],
        activeRepositoryId: 'r1',
        theme: 'dark',
      };

      const msg = createMessage('app.bootstrap', bootstrapPayload);
      const result = safeParseExtensionMessage(msg);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('app.bootstrap');
        if (result.data.type === 'app.bootstrap') {
          expect(result.data.payload.repositories).toHaveLength(1);
        }
      }
    });

    it('successfully parses notification.error message', () => {
      const errMsg = createErrorMessage('Dirty worktree error', AppErrorCode.DIRTY_WORKTREE);
      const result = safeParseExtensionMessage(errMsg);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('notification.error');
        if (result.data.type === 'notification.error') {
          expect(result.data.payload.code).toBe('DIRTY_WORKTREE');
        }
      }
    });

    it('rejects extension messages with invalid payload without crashing', () => {
      const invalidBootstrap = {
        protocolVersion: 1,
        id: 'msg-bs',
        type: 'app.bootstrap',
        payload: {
          protocolVersion: 1,
          repositories: 'not-an-array', // invalid type
        },
      };

      const result = safeParseExtensionMessage(invalidBootstrap);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(AppErrorCode.INVALID_MESSAGE);
      }
    });
  });

  describe('Incremental Loading and Backpressure helpers', () => {
    it('clampPageSize enforces min/max bounds and defaults', () => {
      expect(clampPageSize()).toBe(DEFAULT_PAGE_SIZE);
      expect(clampPageSize(undefined)).toBe(500);
      expect(clampPageSize(null)).toBe(500);
      expect(clampPageSize(0)).toBe(1);
      expect(clampPageSize(-50)).toBe(1);
      expect(clampPageSize(100)).toBe(100);
      expect(clampPageSize(500)).toBe(500);
      expect(clampPageSize(5000)).toBe(MAX_PAGE_SIZE);
    });

    it('measureSerialization and measureDeserialization accurately record timing and size', () => {
      const largeObject = {
        title: 'commits',
        list: Array.from({ length: 500 }, (_, i) => ({
          sha: 'sha-' + i,
          message: 'Commit message number ' + i + ' with descriptive text',
        })),
      };

      const ser = measureSerialization(largeObject, 1024);
      expect(typeof ser.serialized).toBe('string');
      expect(ser.byteLength).toBeGreaterThan(1024);
      expect(ser.isLarge).toBe(true);
      expect(ser.durationMs).toBeGreaterThanOrEqual(0);

      const deser = measureDeserialization<{ title: string; list: unknown[] }>(
        ser.serialized,
        JSON.parse,
        1024,
      );
      expect(deser.result.title).toBe('commits');
      expect(deser.result.list).toHaveLength(500);
      expect(deser.byteLength).toBe(ser.byteLength);
      expect(deser.isLarge).toBe(true);
      expect(deser.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('splitCommitPageIntoChunks chunks commit pages when size exceeds chunkSize', () => {
      const mockCommits: Commit[] = Array.from({ length: 250 }, (_, i) => ({
        sha: 'sha' + i,
        shortSha: 's' + i,
        parents: [],
        author: { name: 'Author', email: 'a@b.com', timestamp: 1000, timezone: '+00:00' },
        committer: { name: 'Author', email: 'a@b.com', timestamp: 1000, timezone: '+00:00' },
        subject: 'Subject ' + i,
        refs: [],
      }));

      const page: CommitPage = {
        commits: mockCommits,
        hasMore: true,
        cursor: '250',
      };

      // When page length <= chunkSize, returns single chunk
      const single = splitCommitPageIntoChunks(page, 300);
      expect(single).toHaveLength(1);
      expect(single[0]?.commits).toHaveLength(250);
      expect(single[0]?.hasMore).toBe(true);
      expect(single[0]?.cursor).toBe('250');

      // When page length > chunkSize (chunkSize = 100)
      const chunks = splitCommitPageIntoChunks(page, 100);
      expect(chunks).toHaveLength(3);
      expect(chunks[0]?.commits).toHaveLength(100);
      expect(chunks[0]?.hasMore).toBe(true);
      expect(chunks[0]?.cursor).toBeUndefined();

      expect(chunks[1]?.commits).toHaveLength(100);
      expect(chunks[1]?.hasMore).toBe(true);
      expect(chunks[1]?.cursor).toBeUndefined();

      expect(chunks[2]?.commits).toHaveLength(50);
      expect(chunks[2]?.hasMore).toBe(true);
      expect(chunks[2]?.cursor).toBe('250');
    });

    it('validates chunked commits.page.result envelope schema', () => {
      const chunkMsg = createMessage('commits.page.result', {
        repositoryId: 'repo-1',
        page: { commits: [], hasMore: true },
        chunkIndex: 0,
        totalChunks: 3,
        isLastChunk: false,
      });

      const parsed = safeParseExtensionMessage(chunkMsg);
      expect(parsed.success).toBe(true);
      if (parsed.success && parsed.data.type === 'commits.page.result') {
        expect(parsed.data.payload.chunkIndex).toBe(0);
        expect(parsed.data.payload.totalChunks).toBe(3);
        expect(parsed.data.payload.isLastChunk).toBe(false);
      }
    });
  });

  describe('ProtocolMessageSchema general parser', () => {
    it('parses either direction correctly', () => {
      const webviewMsg = createMessage('app.ready', {});
      const extensionMsg = createErrorMessage('Some error', AppErrorCode.UNKNOWN_ERROR);

      expect(safeParseMessage(ProtocolMessageSchema, webviewMsg).success).toBe(true);
      expect(safeParseMessage(ProtocolMessageSchema, extensionMsg).success).toBe(true);
    });
  });
});

describe('Worktree & Stash protocol schemas', () => {
  const worktreeStatus = {
    isClean: false,
    staged: [],
    unstaged: [
      {
        path: 'src/index.ts',
        status: 'modified',
        indexStatus: ' ',
        worktreeStatus: 'M',
        staged: false,
        unstaged: true,
      },
    ],
    hasConflicts: false,
    head: null,
  };

  it('parses worktree status requests and results', () => {
    const request = createMessage('worktree.status.request', { repositoryId: 'repo-1' });
    expect(safeParseWebviewMessage(request).success).toBe(true);

    const result = createMessage('worktree.status.result', {
      repositoryId: 'repo-1',
      status: worktreeStatus,
    });
    expect(safeParseExtensionMessage(result).success).toBe(true);
  });

  it('parses stage/unstage/discard requests', () => {
    expect(
      safeParseWebviewMessage(
        createMessage('worktree.stage.request', {
          repositoryId: 'repo-1',
          paths: ['a.ts', 'b.ts'],
        }),
      ).success,
    ).toBe(true);

    expect(
      safeParseWebviewMessage(
        createMessage('worktree.unstage.request', { repositoryId: 'repo-1', paths: [], all: true }),
      ).success,
    ).toBe(true);

    expect(
      safeParseWebviewMessage(
        createMessage('worktree.discard.request', {
          repositoryId: 'repo-1',
          paths: ['a.ts'],
          noConfirm: true,
        }),
      ).success,
    ).toBe(true);

    expect(
      safeParseWebviewMessage(createMessage('worktree.stage.request', { repositoryId: 'repo-1' }))
        .success,
    ).toBe(false);
  });

  it('parses commit creation requests and rejects empty messages', () => {
    expect(
      safeParseWebviewMessage(
        createMessage('operation.commit.create.request', {
          repositoryId: 'repo-1',
          message: 'feat: add worktree panel',
          description: 'Longer description',
          amend: false,
        }),
      ).success,
    ).toBe(true);

    expect(
      safeParseWebviewMessage(
        createMessage('operation.commit.create.request', {
          repositoryId: 'repo-1',
          message: '',
        }),
      ).success,
    ).toBe(false);
  });

  it('parses stash lifecycle requests and results', () => {
    expect(
      safeParseWebviewMessage(createMessage('stash.list.request', { repositoryId: 'repo-1' }))
        .success,
    ).toBe(true);

    expect(
      safeParseWebviewMessage(
        createMessage('stash.save.request', {
          repositoryId: 'repo-1',
          message: 'wip',
          includeUntracked: true,
          keepIndex: false,
        }),
      ).success,
    ).toBe(true);

    for (const type of [
      'stash.pop.request',
      'stash.apply.request',
      'stash.drop.request',
    ] as const) {
      expect(
        safeParseWebviewMessage(createMessage(type, { repositoryId: 'repo-1', index: 0 })).success,
      ).toBe(true);
      expect(
        safeParseWebviewMessage(createMessage(type, { repositoryId: 'repo-1', index: -1 })).success,
      ).toBe(false);
    }

    expect(
      safeParseExtensionMessage(
        createMessage('stash.list.result', {
          repositoryId: 'repo-1',
          stashes: [{ index: 0, ref: 'stash@{0}', sha: 'a'.repeat(40), message: 'WIP on main' }],
        }),
      ).success,
    ).toBe(true);
  });
});

describe('Interactive rebase protocol schemas', () => {
  const entry = {
    action: 'pick' as const,
    sha: 'a'.repeat(40),
    shortSha: 'aaaaaaa',
    subject: 'feat: initial',
    author: 'Ada',
    date: 1700000000,
  };

  it('accepts plan requests and returns plan results', () => {
    expect(
      safeParseWebviewMessage(
        createMessage('rebase.interactive.plan.request', {
          repositoryId: 'repo-1',
          onto: 'main~2',
        }),
      ).success,
    ).toBe(true);

    expect(
      safeParseExtensionMessage(
        createMessage('rebase.interactive.plan.result', {
          requestId: 'req-1',
          repositoryId: 'repo-1',
          onto: 'a'.repeat(40),
          entries: [entry],
        }),
      ).success,
    ).toBe(true);

    expect(
      safeParseExtensionMessage(
        createMessage('rebase.interactive.plan.result', {
          requestId: 'req-1',
          repositoryId: 'repo-1',
          onto: 'a'.repeat(40),
          entries: [],
          error: 'fatal: bad revision',
        }),
      ).success,
    ).toBe(true);
  });

  it('validates start plans and rebase action requests', () => {
    expect(
      safeParseWebviewMessage(
        createMessage('rebase.interactive.start.request', {
          repositoryId: 'repo-1',
          onto: 'a'.repeat(40),
          plan: [entry, { ...entry, action: 'squash', sha: 'b'.repeat(40) }],
          confirmedPublishedBranch: true,
        }),
      ).success,
    ).toBe(true);

    expect(
      safeParseWebviewMessage(
        createMessage('rebase.interactive.start.request', {
          repositoryId: 'repo-1',
          plan: [],
        }),
      ).success,
    ).toBe(false);

    for (const type of [
      'rebase.interactive.continue',
      'rebase.interactive.abort',
      'rebase.interactive.skip',
    ] as const) {
      expect(safeParseWebviewMessage(createMessage(type, { repositoryId: 'repo-1' })).success).toBe(
        true,
      );
    }
  });
});
