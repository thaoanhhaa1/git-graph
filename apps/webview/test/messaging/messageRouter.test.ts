import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  notifyAppReady,
  requestRepositoriesList,
  selectRepository,
  requestCommitsPage,
  requestNextCommitsPage,
  requestCommitDetails,
  requestGraphRefresh,
  requestCheckout,
  requestCreateBranch,
  requestCreateTag,
  requestDeleteTag,
  requestMerge,
  requestAbortMerge,
  requestRebase,
  requestCherryPick,
  requestCherryPickAction,
  requestRevert,
  requestReset,
  requestFetch,
  requestPull,
  requestRemoteList,
  requestAddRemote,
  requestRemoveRemote,
  requestRenameRemote,
  requestSetRemoteUrl,
  requestUndo,
  requestSyncStatus,
  requestWorktreeStatus,
  requestStageWorktree,
  requestUnstageWorktree,
  requestDiscardWorktree,
  requestGitWorktreeList,
  requestAddGitWorktree,
  requestRemoveGitWorktree,
  requestOpenGitWorktreeInNewWindow,
  requestSubmoduleList,
  requestOpenSubmodule,
  requestCreateCommit,
  requestStashList,
  requestSaveStash,
  requestPopStash,
  requestApplyStash,
  requestDropStash,
  handleIncomingMessage,
  initMessageRouter,
  resetInvalidationThrottle,
  resetPendingReveal,
} from '../../src/messaging/messageRouter';
import { setVsCodeApi, createMockVsCodeApi } from '../../src/messaging/vscodeApi';
import { useRepositoryStore } from '../../src/stores/repositoryStore';
import { useGraphStore } from '../../src/stores/graphStore';
import { useSelectionStore } from '../../src/stores/selectionStore';
import { useWorktreeStore } from '../../src/stores/worktreeStore';
import { useOperationStore } from '../../src/stores/operationStore';
import { useRemoteStore } from '../../src/stores/remoteStore';
import { useUiStore } from '../../src/stores/uiStore';
import { useGitWorktreeStore } from '../../src/stores/gitWorktreeStore';
import { useSubmoduleStore } from '../../src/stores/submoduleStore';
import { getLocale, setLocale } from '../../src/i18n';
import type {
  MessageEnvelope,
  AppBootstrapMessage,
  RepositoriesListResultMessage,
  RepositoryChangedMessage,
  CommitsPageResultMessage,
  GraphInvalidatedMessage,
  NotificationErrorMessage,
} from '@git-graph/shared';
import { AppErrorCode } from '@git-graph/shared';

describe('messageRouter', () => {
  let postedMessages: MessageEnvelope[] = [];

  beforeEach(() => {
    postedMessages = [];
    setVsCodeApi(
      createMockVsCodeApi(undefined, (msg) => {
        postedMessages.push(msg as MessageEnvelope);
      }),
    );
    useRepositoryStore.getState().reset();
    useGraphStore.getState().reset();
    useSelectionStore.getState().reset();
    useOperationStore.getState().reset();
    useRemoteStore.getState().reset();
    useGitWorktreeStore.getState().reset();
    useSubmoduleStore.getState().reset();
    setLocale('en');
    useUiStore.getState().clearRequestedDialog();
    resetInvalidationThrottle();
    resetPendingReveal();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('notifies app.ready to extension host', () => {
    notifyAppReady();

    expect(postedMessages).toHaveLength(1);
    expect(postedMessages[0]?.type).toBe('app.ready');
    expect(postedMessages[0]?.protocolVersion).toBe(1);
  });

  it('requests repository list refresh', () => {
    requestRepositoriesList(true);

    expect(postedMessages).toHaveLength(1);
    expect(postedMessages[0]?.type).toBe('repositories.list.request');
    expect((postedMessages[0]?.payload as { refresh: boolean }).refresh).toBe(true);
    expect(useRepositoryStore.getState().isLoading).toBe(true);
  });

  it('selects repository, syncs stores, and requests commits', () => {
    useRepositoryStore.getState().setRepositories([
      { id: 'repo-1', name: 'Repo 1', path: '/repo-1' },
      { id: 'repo-2', name: 'Repo 2', path: '/repo-2' },
    ]);
    postedMessages = [];

    selectRepository('repo-2');

    expect(useRepositoryStore.getState().activeRepositoryId).toBe('repo-2');
    expect(useSelectionStore.getState().selectedCommitSha).toBeNull();

    const selectMsg = postedMessages.find((m) => m.type === 'repository.select');
    expect(selectMsg).toBeDefined();
    expect((selectMsg?.payload as { repositoryId: string }).repositoryId).toBe('repo-2');

    const commitsMsg = postedMessages.find((m) => m.type === 'commits.page.request');
    expect(commitsMsg).toBeDefined();
    expect((commitsMsg?.payload as { repositoryId: string }).repositoryId).toBe('repo-2');
  });

  it('requests commits page with active filters', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    useGraphStore.getState().setSelectedBranch('feature/m3');
    useGraphStore.getState().setSearchTerm('initial');
    postedMessages = [];

    const reqId = requestCommitsPage();
    expect(reqId).toBeTruthy();

    const msg = postedMessages.find((m) => m.type === 'commits.page.request');
    expect(msg).toBeDefined();
    expect(msg?.payload).toMatchObject({
      repositoryId: 'repo-1',
      limit: 500,
      branch: 'feature/m3',
      search: 'initial',
    });
  });

  it('requests next commits page with cursor', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    // Simulate initial page loaded with hasMore and cursor
    useGraphStore.getState().startLoadingPage({ repositoryId: 'repo-1' });
    useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: {
        commits: [
          {
            sha: '1111111111111111111111111111111111111111',
            shortSha: '1111111',
            parents: [],
            author: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: '' },
            committer: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: '' },
            subject: 'c1',
            refs: [],
          },
        ],
        cursor: 'next-page-token',
        hasMore: true,
      },
    });

    postedMessages = [];
    const nextReqId = requestNextCommitsPage(25);
    expect(nextReqId).toBeTruthy();

    const msg = postedMessages.find((m) => m.type === 'commits.page.request');
    expect(msg).toBeDefined();
    expect(msg?.payload).toMatchObject({
      repositoryId: 'repo-1',
      cursor: 'next-page-token',
      limit: 25,
    });
  });

  it('enforces backpressure by rejecting concurrent next page requests', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);

    useGraphStore.getState().receiveCommitsPage({
      repositoryId: 'repo-1',
      page: {
        commits: [
          {
            sha: 'c11111111111111111111111111111111111111',
            shortSha: 'c111111',
            parents: [],
            author: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: '' },
            committer: { name: 'A', email: 'a@a.com', timestamp: 0, timezone: '' },
            subject: 'c1',
            refs: [],
          },
        ],
        cursor: 'cursor-1',
        hasMore: true,
      },
    });

    postedMessages = [];
    const firstReq = requestNextCommitsPage();
    expect(firstReq).toBeTruthy();
    expect(postedMessages).toHaveLength(1);

    // Second immediate request while first is in flight should be suppressed
    const duplicateReq = requestNextCommitsPage();
    expect(duplicateReq).toBeNull();
    expect(postedMessages).toHaveLength(1);
  });

  it('requests commit details', () => {
    requestCommitDetails('repo-1', 'sha12345');
    const msg = postedMessages.find((m) => m.type === 'commit.details.request');
    expect(msg).toBeDefined();
    expect(msg?.payload).toEqual({ repositoryId: 'repo-1', sha: 'sha12345' });
  });

  it('requests graph refresh', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    requestGraphRefresh(false);
    const msg = postedMessages.find((m) => m.type === 'graph.refresh.request');
    expect(msg).toBeDefined();
    expect(msg?.payload).toEqual({ repositoryId: 'repo-1', hard: false });
  });

  it('requests fetch from remote with a tracked operation ID', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    const requestId = requestFetch({ remote: 'origin', prune: true });
    expect(requestId).toBeTruthy();
    expect(useGraphStore.getState().isFetching).toBe(true);
    expect(useRepositoryStore.getState().isLoading).toBe(false);

    const msg = postedMessages.find((m) => m.type === 'operation.fetch.request');
    expect(msg).toBeDefined();
    expect(msg?.id).toBe(requestId);
    expect(msg?.payload).toEqual({
      repositoryId: 'repo-1',
      remote: 'origin',
      prune: true,
    });
  });

  it('requests fetch for all remotes', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    requestFetch({ all: true });

    expect(postedMessages[0]?.payload).toEqual({
      repositoryId: 'repo-1',
      prune: true,
      all: true,
    });
  });

  it('requests pull with strategy and autostash options', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    const requestId = requestPull({
      remote: 'origin',
      branch: 'main',
      strategy: 'rebase',
      autostash: true,
    });

    expect(requestId).toBeTruthy();
    expect(useOperationStore.getState().activeRequestId).toBe(requestId);
    expect(useGraphStore.getState().isFetching).toBe(true);
    expect(postedMessages[0]?.type).toBe('operation.pull.request');
    expect(postedMessages[0]?.id).toBe(requestId);
    expect(postedMessages[0]?.payload).toEqual({
      repositoryId: 'repo-1',
      remote: 'origin',
      branch: 'main',
      strategy: 'rebase',
      autostash: true,
    });
  });

  it.each([
    ['add', requestAddRemote, 'remote.add.request', { name: 'fork', url: 'https://x/fork.git' }],
    ['remove', requestRemoveRemote, 'remote.remove.request', { name: 'fork' }],
    ['rename', requestRenameRemote, 'remote.rename.request', { oldName: 'a', newName: 'b' }],
    [
      'set URL',
      requestSetRemoteUrl,
      'remote.setUrl.request',
      { name: 'origin', url: 'https://x', push: true },
    ],
  ] as const)(
    'requests remote %s with a tracked operation ID',
    (_label, request, type, payload) => {
      useRepositoryStore
        .getState()
        .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
      postedMessages = [];

      const requestId = request({ repositoryId: 'repo-1', ...payload } as never);

      expect(requestId).toBeTruthy();
      expect(useOperationStore.getState().activeRequestId).toBe(requestId);
      expect(postedMessages[0]?.type).toBe(type);
      expect(postedMessages[0]?.payload).toEqual({ repositoryId: 'repo-1', ...payload });
    },
  );

  it('requests remote list and sync status without starting an operation', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    requestRemoteList('repo-1');
    requestSyncStatus();

    expect(postedMessages[0]?.type).toBe('remote.list.request');
    expect(postedMessages[1]?.type).toBe('repository.syncStatus.request');
    expect(useRemoteStore.getState().isLoading).toBe(true);
    expect(useOperationStore.getState().activeRequestId).toBeNull();
  });

  it('requests undo with reflog target and starts an operation', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    const requestId = requestUndo({
      repositoryId: 'repo-1',
      reflogIndex: 1,
      expectedSha: 'abc123',
    });

    expect(requestId).toBeTruthy();
    expect(useOperationStore.getState().activeRequestId).toBe(requestId);
    expect(postedMessages[0]?.type).toBe('operation.undo.request');
    expect(postedMessages[0]?.payload).toEqual({
      repositoryId: 'repo-1',
      reflogIndex: 1,
      expectedSha: 'abc123',
    });
  });

  it('requests checkout with a tracked operation ID', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    const requestId = requestCheckout({
      target: 'refs/heads/feature/safe',
      targetType: 'localBranch',
    });

    expect(requestId).toBeTruthy();
    const msg = postedMessages.find((message) => message.type === 'operation.checkout.request');
    expect(msg?.id).toBe(requestId);
    expect(msg?.requestId).toBe(requestId);
    expect(msg?.payload).toEqual({
      repositoryId: 'repo-1',
      target: 'refs/heads/feature/safe',
      targetType: 'localBranch',
    });
  });

  it('requests branch creation with its start point and a tracked operation ID', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    const requestId = requestCreateBranch({ startPoint: 'abcdef1234567' });

    expect(requestId).toBeTruthy();
    const msg = postedMessages.find(
      (message) => message.type === 'operation.branch.create.request',
    );
    expect(msg?.id).toBe(requestId);
    expect(msg?.requestId).toBe(requestId);
    expect(msg?.payload).toEqual({
      repositoryId: 'repo-1',
      startPoint: 'abcdef1234567',
    });
  });

  it('requests lightweight tag creation with its target and a tracked operation ID', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    const requestId = requestCreateTag({
      target: 'abcdef1234567',
      tagType: 'lightweight',
    });

    expect(requestId).toBeTruthy();
    const msg = postedMessages.find((message) => message.type === 'operation.tag.create.request');
    expect(msg?.id).toBe(requestId);
    expect(msg?.requestId).toBe(requestId);
    expect(msg?.payload).toEqual({
      repositoryId: 'repo-1',
      target: 'abcdef1234567',
      tagType: 'lightweight',
    });
  });

  it('requests delete tag operations with optional remote deletion', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    const localRequestId = requestDeleteTag({ tagName: 'v1.0.0' });
    expect(localRequestId).toBeTruthy();
    const localMsg = postedMessages.find(
      (message) => message.type === 'operation.tag.delete.request',
    );
    expect(localMsg?.id).toBe(localRequestId);
    expect(localMsg?.requestId).toBe(localRequestId);
    expect(localMsg?.payload).toEqual({
      repositoryId: 'repo-1',
      tagName: 'v1.0.0',
    });

    const remoteRequestId = requestDeleteTag({
      tagName: 'v1.0.0',
      deleteOnRemote: true,
      remote: 'origin',
    });
    const remoteMsg = postedMessages.filter(
      (message) => message.type === 'operation.tag.delete.request',
    )[1];
    expect(remoteMsg?.id).toBe(remoteRequestId);
    expect(remoteMsg?.payload).toEqual({
      repositoryId: 'repo-1',
      tagName: 'v1.0.0',
      deleteOnRemote: true,
      remote: 'origin',
    });
  });

  it('requests merge and merge abort operations with tracked operation IDs', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    const mergeRequestId = requestMerge({
      target: 'abcdef1234567',
      fastForwardMode: 'ff',
    });
    const mergeMsg = postedMessages.find((message) => message.type === 'operation.merge.request');
    expect(mergeRequestId).toBeTruthy();
    expect(mergeMsg?.id).toBe(mergeRequestId);
    expect(mergeMsg?.requestId).toBe(mergeRequestId);
    expect(mergeMsg?.payload).toEqual({
      repositoryId: 'repo-1',
      target: 'abcdef1234567',
      fastForwardMode: 'ff',
    });

    const abortRequestId = requestAbortMerge();
    const abortMsg = postedMessages.find(
      (message) => message.type === 'operation.merge.abort.request',
    );
    expect(abortRequestId).toBeTruthy();
    expect(abortMsg?.id).toBe(abortRequestId);
    expect(abortMsg?.requestId).toBe(abortRequestId);
    expect(abortMsg?.payload).toEqual({ repositoryId: 'repo-1' });
  });

  it('requests reset operations with target, mode, and tracked operation IDs', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    const requestId = requestReset({
      target: 'abcdef1234567',
      mode: 'hard',
      confirmedHardReset: true,
    });

    expect(requestId).toBeTruthy();
    const msg = postedMessages.find((message) => message.type === 'operation.reset.request');
    expect(msg?.id).toBe(requestId);
    expect(msg?.requestId).toBe(requestId);
    expect(msg?.payload).toEqual({
      repositoryId: 'repo-1',
      target: 'abcdef1234567',
      mode: 'hard',
      confirmedHardReset: true,
    });
  });

  it('requests cherry-pick and sequencer actions with tracked operation IDs', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    const cpRequestId = requestCherryPick({ commit: '81e0b3f', noConfirm: true });
    expect(cpRequestId).toBeTruthy();
    const cpMsg = postedMessages.find((message) => message.type === 'operation.cherryPick.request');
    expect(cpMsg?.id).toBe(cpRequestId);
    expect(cpMsg?.requestId).toBe(cpRequestId);
    expect(cpMsg?.payload).toEqual({
      repositoryId: 'repo-1',
      commit: '81e0b3f',
      noConfirm: true,
    });

    const continueRequestId = requestCherryPickAction('continue');
    expect(continueRequestId).toBeTruthy();
    const continueMsg = postedMessages.find(
      (message) => message.type === 'operation.cherryPick.continue.request',
    );
    expect(continueMsg?.id).toBe(continueRequestId);
    expect(continueMsg?.payload).toEqual({ repositoryId: 'repo-1' });

    const abortRequestId = requestCherryPickAction('abort');
    expect(abortRequestId).toBeTruthy();
    const abortMsg = postedMessages.find(
      (message) => message.type === 'operation.cherryPick.abort.request',
    );
    expect(abortMsg?.id).toBe(abortRequestId);
    expect(abortMsg?.payload).toEqual({ repositoryId: 'repo-1' });

    const skipRequestId = requestCherryPickAction('skip');
    expect(skipRequestId).toBeTruthy();
    const skipMsg = postedMessages.find(
      (message) => message.type === 'operation.cherryPick.skip.request',
    );
    expect(skipMsg?.id).toBe(skipRequestId);
    expect(skipMsg?.payload).toEqual({ repositoryId: 'repo-1' });
  });

  it('requests revert operations with an optional mainline parent', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    const requestId = requestRevert({ commit: '81e0b3f', mainlineParent: 2, noConfirm: true });

    expect(requestId).toBeTruthy();
    const msg = postedMessages.find((message) => message.type === 'operation.revert.request');
    expect(msg?.id).toBe(requestId);
    expect(msg?.requestId).toBe(requestId);
    expect(msg?.payload).toEqual({
      repositoryId: 'repo-1',
      commit: '81e0b3f',
      mainlineParent: 2,
      noConfirm: true,
    });
  });

  it('requests rebase with the ignore-date option', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    const requestId = requestRebase({ target: 'main', ignoreDate: true, noConfirm: true });

    expect(requestId).toBeTruthy();
    const msg = postedMessages.find((message) => message.type === 'operation.rebase.request');
    expect(msg?.id).toBe(requestId);
    expect(msg?.payload).toEqual({
      repositoryId: 'repo-1',
      target: 'main',
      ignoreDate: true,
      noConfirm: true,
    });
  });

  it('requests worktree status and stage/unstage/discard operations', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    const statusId = requestWorktreeStatus();
    expect(statusId).toBeTruthy();
    const statusMsg = postedMessages.find((m) => m.type === 'worktree.status.request');
    expect(statusMsg?.id).toBe(statusId);
    expect(statusMsg?.payload).toEqual({ repositoryId: 'repo-1' });

    const stageId = requestStageWorktree({ paths: ['src/a.ts'] });
    const stageMsg = postedMessages.find((m) => m.type === 'worktree.stage.request');
    expect(stageMsg?.id).toBe(stageId);
    expect(stageMsg?.payload).toEqual({ repositoryId: 'repo-1', paths: ['src/a.ts'] });

    const unstageId = requestUnstageWorktree({ paths: [], all: true });
    const unstageMsg = postedMessages.find((m) => m.type === 'worktree.unstage.request');
    expect(unstageMsg?.id).toBe(unstageId);
    expect(unstageMsg?.payload).toEqual({ repositoryId: 'repo-1', paths: [], all: true });

    const discardId = requestDiscardWorktree({ paths: ['src/a.ts'], noConfirm: true });
    const discardMsg = postedMessages.find((m) => m.type === 'worktree.discard.request');
    expect(discardMsg?.id).toBe(discardId);
    expect(discardMsg?.payload).toEqual({
      repositoryId: 'repo-1',
      paths: ['src/a.ts'],
      noConfirm: true,
    });
  });

  it('requests commit creation and stash lifecycle operations', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
    postedMessages = [];

    const commitId = requestCreateCommit({ message: 'feat: x', amend: false });
    const commitMsg = postedMessages.find((m) => m.type === 'operation.commit.create.request');
    expect(commitMsg?.id).toBe(commitId);
    expect(commitMsg?.requestId).toBe(commitId);
    expect(commitMsg?.payload).toEqual({
      repositoryId: 'repo-1',
      message: 'feat: x',
      amend: false,
    });

    const listId = requestStashList();
    const listMsg = postedMessages.find((m) => m.type === 'stash.list.request');
    expect(listMsg?.id).toBe(listId);

    const saveId = requestSaveStash({ message: 'wip', includeUntracked: true });
    const saveMsg = postedMessages.find((m) => m.type === 'stash.save.request');
    expect(saveMsg?.id).toBe(saveId);
    expect(saveMsg?.payload).toEqual({
      repositoryId: 'repo-1',
      message: 'wip',
      includeUntracked: true,
    });

    for (const [fn, type] of [
      [requestPopStash, 'stash.pop.request'],
      [requestApplyStash, 'stash.apply.request'],
      [requestDropStash, 'stash.drop.request'],
    ] as const) {
      const id = fn(2);
      const msg = postedMessages.find((m) => m.type === type);
      expect(msg?.id).toBe(id);
      expect(msg?.requestId).toBe(id);
      expect(msg?.payload).toEqual({ repositoryId: 'repo-1', index: 2 });
    }
  });

  it('returns null for worktree requests when no repository is active', () => {
    expect(requestWorktreeStatus()).toBeNull();
    expect(requestStageWorktree({ paths: ['a.ts'] })).toBeNull();
    expect(requestCreateCommit({ message: 'x' })).toBeNull();
    expect(requestStashList()).toBeNull();
    expect(requestPopStash(0)).toBeNull();
  });

  it('requests worktree and submodule operations with the active repository', () => {
    useRepositoryStore
      .getState()
      .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);

    expect(requestGitWorktreeList()).toBeTruthy();
    expect(requestAddGitWorktree({ path: '/repos/new', newBranch: 'feature' })).toBeTruthy();
    expect(requestRemoveGitWorktree({ path: '/repos/new', force: true })).toBeTruthy();
    expect(requestOpenGitWorktreeInNewWindow({ path: '/repos/new' })).toBeTruthy();
    expect(requestSubmoduleList()).toBeTruthy();
    expect(requestOpenSubmodule({ path: 'libs/core' })).toBeTruthy();

    expect(postedMessages.map((m) => m.type)).toEqual(
      expect.arrayContaining([
        'worktree.list.request',
        'worktree.add.request',
        'worktree.remove.request',
        'worktree.open.request',
        'submodule.list.request',
        'submodule.open.request',
      ]),
    );

    const add = postedMessages.find((m) => m.type === 'worktree.add.request');
    expect(add?.payload).toMatchObject({
      repositoryId: 'repo-1',
      path: '/repos/new',
      newBranch: 'feature',
    });
  });

  it('applies the bootstrap locale to webview translations', () => {
    handleIncomingMessage({
      protocolVersion: 1,
      id: 'boot-locale',
      type: 'app.bootstrap',
      payload: {
        protocolVersion: 1,
        repositories: [],
        locale: 'vi',
      },
    });

    expect(getLocale()).toBe('vi');
  });

  describe('handling incoming messages', () => {
    it('safely ignores invalid or non-protocol messages', () => {
      expect(handleIncomingMessage(null)).toBe(false);
      expect(handleIncomingMessage('not an object')).toBe(false);
      expect(handleIncomingMessage({ invalid: true })).toBe(false);
    });

    it('handles app.bootstrap message and loads commits for active repo', () => {
      const msg: AppBootstrapMessage = {
        protocolVersion: 1,
        id: 'boot-1',
        type: 'app.bootstrap',
        payload: {
          protocolVersion: 1,
          repositories: [{ id: 'repo-boot', name: 'Bootstrap Repo', path: '/boot' }],
          activeRepositoryId: 'repo-boot',
          theme: 'dark',
        },
      };

      const handled = handleIncomingMessage(msg);
      expect(handled).toBe(true);

      const repoState = useRepositoryStore.getState();
      expect(repoState.hasBootstrapped).toBe(true);
      expect(repoState.activeRepositoryId).toBe('repo-boot');
      expect(repoState.repositories).toHaveLength(1);

      // Verify it requested commits page for active repo
      const commitsReq = postedMessages.find((m) => m.type === 'commits.page.request');
      expect(commitsReq).toBeDefined();
      expect((commitsReq?.payload as { repositoryId: string }).repositoryId).toBe('repo-boot');
    });

    it('handles repositories.list.result message', () => {
      const msg: RepositoriesListResultMessage = {
        protocolVersion: 1,
        id: 'res-1',
        type: 'repositories.list.result',
        payload: {
          repositories: [
            {
              id: 'repo-new',
              name: 'New Repo',
              rootPath: '/new',
              gitDir: '/new/.git',
              isBare: false,
            },
          ],
        },
      };

      const handled = handleIncomingMessage(msg);
      expect(handled).toBe(true);
      expect(useRepositoryStore.getState().repositories).toHaveLength(1);
    });

    it('handles repository.changed message', () => {
      useRepositoryStore.getState().setRepositories([
        { id: 'repo-1', name: 'Repo 1', path: '/r1' },
        { id: 'repo-2', name: 'Repo 2', path: '/r2' },
      ]);
      useSelectionStore.getState().selectCommit('old-commit');
      postedMessages = [];

      const msg: RepositoryChangedMessage = {
        protocolVersion: 1,
        id: 'changed-1',
        type: 'repository.changed',
        payload: { activeRepositoryId: 'repo-2' },
      };

      handleIncomingMessage(msg);

      expect(useRepositoryStore.getState().activeRepositoryId).toBe('repo-2');
      expect(useSelectionStore.getState().selectedCommitSha).toBeNull();
      const commitsReq = postedMessages.find((m) => m.type === 'commits.page.request');
      expect(commitsReq).toBeDefined();
      expect((commitsReq?.payload as { repositoryId: string }).repositoryId).toBe('repo-2');
    });

    it('handles worktree.status.result and stash.list.result messages', () => {
      const statusMsg: MessageEnvelope = {
        protocolVersion: 1,
        id: 'wt-res-1',
        type: 'worktree.status.result',
        payload: {
          repositoryId: 'repo-1',
          status: {
            isClean: false,
            staged: [],
            unstaged: [
              {
                path: 'a.ts',
                status: 'modified',
                indexStatus: ' ',
                worktreeStatus: 'M',
                staged: false,
                unstaged: true,
              },
            ],
            hasConflicts: false,
            head: null,
          },
        },
      };
      expect(handleIncomingMessage(statusMsg)).toBe(true);
      expect(useWorktreeStore.getState().status?.unstaged).toHaveLength(1);
      expect(useWorktreeStore.getState().isLoading).toBe(false);

      const stashMsg: MessageEnvelope = {
        protocolVersion: 1,
        id: 'stash-res-1',
        type: 'stash.list.result',
        payload: {
          repositoryId: 'repo-1',
          stashes: [{ index: 0, ref: 'stash@{0}', sha: 'a'.repeat(40), message: 'WIP' }],
        },
      };
      expect(handleIncomingMessage(stashMsg)).toBe(true);
      expect(useWorktreeStore.getState().stashes).toHaveLength(1);
    });

    it('handles worktree.list.result and submodule.list.result messages', () => {
      expect(
        handleIncomingMessage({
          protocolVersion: 1,
          id: 'worktree-list-result',
          type: 'worktree.list.result',
          payload: {
            repositoryId: 'repo-1',
            currentPath: '/repos/main',
            worktrees: [
              { path: '/repos/main', branch: 'main', isCurrent: true },
              { path: '/repos/feature', branch: 'feature' },
            ],
          },
        }),
      ).toBe(true);
      expect(useGitWorktreeStore.getState().worktrees).toHaveLength(2);
      expect(useGitWorktreeStore.getState().currentPath).toBe('/repos/main');

      expect(
        handleIncomingMessage({
          protocolVersion: 1,
          id: 'submodule-list-result',
          type: 'submodule.list.result',
          payload: {
            repositoryId: 'repo-1',
            submodules: [{ name: 'libs/core', path: 'libs/core', state: 'dirty' }],
          },
        }),
      ).toBe(true);
      expect(useSubmoduleStore.getState().submodules).toHaveLength(1);
    });

    it('refreshes worktree status and stashes on graph.invalidated for the active repo', () => {
      useRepositoryStore
        .getState()
        .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/repo-1' }]);
      useWorktreeStore.getState().receiveStatus('repo-1', {
        isClean: true,
        staged: [],
        unstaged: [],
        hasConflicts: false,
        head: null,
      });
      postedMessages = [];

      handleIncomingMessage({
        protocolVersion: 1,
        id: 'inv-1',
        type: 'graph.invalidated',
        payload: { repositoryId: 'repo-1' },
      });

      expect(postedMessages.some((m) => m.type === 'worktree.status.request')).toBe(true);
      expect(postedMessages.some((m) => m.type === 'stash.list.request')).toBe(true);
    });

    it('handles commits.page.result message and updates graph store', () => {
      useRepositoryStore
        .getState()
        .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/r1' }]);
      const { requestId } = useGraphStore.getState().startLoadingPage({ repositoryId: 'repo-1' });

      const msg: CommitsPageResultMessage = {
        protocolVersion: 1,
        id: 'c-page-1',
        type: 'commits.page.result',
        payload: {
          requestId,
          repositoryId: 'repo-1',
          page: {
            commits: [
              {
                sha: 'aabbccddeeff0011223344556677889900aabbcc',
                shortSha: 'aabbccd',
                parents: [],
                author: { name: 'Dev', email: 'dev@dev.com', timestamp: 0, timezone: '' },
                committer: { name: 'Dev', email: 'dev@dev.com', timestamp: 0, timezone: '' },
                subject: 'feat: add store router',
                refs: [],
              },
            ],
            hasMore: false,
          },
        },
      };

      handleIncomingMessage(msg);

      expect(useGraphStore.getState().commits).toHaveLength(1);
      expect(useGraphStore.getState().commits[0]?.shortSha).toBe('aabbccd');
      expect(useGraphStore.getState().isLoading).toBe(false);
    });

    it('reveals a commit that is already loaded in the graph', () => {
      useRepositoryStore
        .getState()
        .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/r1' }]);
      useRepositoryStore.getState().setActiveRepositoryId('repo-1');
      useGraphStore.setState({
        activeRepoId: 'repo-1',
        commits: [
          {
            sha: 'aabbccddeeff0011223344556677889900aabbcc',
            shortSha: 'aabbccd',
            parents: [],
            author: { name: 'Dev', email: 'dev@dev.com', timestamp: 0, timezone: '' },
            committer: { name: 'Dev', email: 'dev@dev.com', timestamp: 0, timezone: '' },
            subject: 'feat: target',
            refs: [],
          },
        ],
      });

      handleIncomingMessage({
        protocolVersion: 1,
        id: 'reveal-1',
        type: 'graph.reveal.commit',
        payload: {
          sha: 'aabbccddeeff0011223344556677889900aabbcc',
          repositoryId: 'repo-1',
        },
      });

      expect(useGraphStore.getState().revealCommitSha).toBe(
        'aabbccddeeff0011223344556677889900aabbcc',
      );
      expect(useSelectionStore.getState().selectedCommitSha).toBe(
        'aabbccddeeff0011223344556677889900aabbcc',
      );
    });

    it('loads the next page while a revealed commit is not yet present', () => {
      useRepositoryStore
        .getState()
        .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/r1' }]);
      useRepositoryStore.getState().setActiveRepositoryId('repo-1');
      useGraphStore.setState({
        activeRepoId: 'repo-1',
        commits: [],
        hasMore: true,
        cursor: 'cursor-1',
        isLoading: false,
        isLoadingMore: false,
        currentRequestId: null,
      });
      postedMessages = [];

      handleIncomingMessage({
        protocolVersion: 1,
        id: 'reveal-2',
        type: 'graph.reveal.commit',
        payload: { sha: 'ffffffffffffffffffffffffffffffffffffffff' },
      });

      const request = postedMessages.find((message) => message.type === 'commits.page.request');
      expect(request).toBeDefined();
      expect((request?.payload as { cursor?: string }).cursor).toBe('cursor-1');
      expect(useGraphStore.getState().revealCommitSha).toBeNull();
    });

    it('falls back to a hash search when the commit cannot be paginated into the graph', () => {
      useRepositoryStore
        .getState()
        .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/r1' }]);
      useRepositoryStore.getState().setActiveRepositoryId('repo-1');
      useGraphStore.setState({
        activeRepoId: 'repo-1',
        commits: [],
        hasMore: false,
        cursor: undefined,
        isLoading: false,
        isLoadingMore: false,
        currentRequestId: null,
        searchTerm: '',
        searchType: 'all',
      });
      postedMessages = [];

      handleIncomingMessage({
        protocolVersion: 1,
        id: 'reveal-3',
        type: 'graph.reveal.commit',
        payload: { sha: 'ffffffffffffffffffffffffffffffffffffffff' },
      });

      const request = postedMessages.find((message) => message.type === 'search.request');
      expect(request).toBeDefined();
      expect((request?.payload as { query: string }).query).toBe(
        'ffffffffffffffffffffffffffffffffffffffff',
      );
      expect(useGraphStore.getState().searchType).toBe('hash');
      expect(useGraphStore.getState().searchTerm).toBe('ffffffffffffffffffffffffffffffffffffffff');
    });

    it('does not repeat the hash search when the fallback result is empty', () => {
      useRepositoryStore
        .getState()
        .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/r1' }]);
      useRepositoryStore.getState().setActiveRepositoryId('repo-1');
      useGraphStore.setState({
        activeRepoId: 'repo-1',
        commits: [],
        hasMore: false,
        cursor: undefined,
        isLoading: false,
        isLoadingMore: false,
        currentRequestId: null,
        searchTerm: '',
        searchType: 'all',
      });
      postedMessages = [];

      handleIncomingMessage({
        protocolVersion: 1,
        id: 'reveal-4',
        type: 'graph.reveal.commit',
        payload: { sha: 'ffffffffffffffffffffffffffffffffffffffff' },
      });
      expect(postedMessages.filter((message) => message.type === 'search.request')).toHaveLength(1);

      handleIncomingMessage({
        protocolVersion: 1,
        id: 'search-result-4',
        type: 'search.result',
        payload: {
          repositoryId: 'repo-1',
          query: 'ffffffffffffffffffffffffffffffffffffffff',
          searchType: 'hash',
          commits: [],
        },
      });

      expect(postedMessages.filter((message) => message.type === 'search.request')).toHaveLength(1);
    });

    it('handles graph.invalidated message by refreshing commits', () => {
      useRepositoryStore
        .getState()
        .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/r1' }]);
      postedMessages = [];

      const msg: GraphInvalidatedMessage = {
        protocolVersion: 1,
        id: 'inv-1',
        type: 'graph.invalidated',
        payload: { repositoryId: 'repo-1' },
      };

      handleIncomingMessage(msg);

      const commitsReq = postedMessages.find((m) => m.type === 'commits.page.request');
      expect(commitsReq).toBeDefined();
    });

    it('throttles duplicate graph.invalidated messages for the same repository to prevent double loading', () => {
      useRepositoryStore
        .getState()
        .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/r1' }]);
      postedMessages = [];

      const msg1: GraphInvalidatedMessage = {
        protocolVersion: 1,
        id: 'inv-1',
        type: 'graph.invalidated',
        payload: { repositoryId: 'repo-1' },
      };
      const msg2: GraphInvalidatedMessage = {
        protocolVersion: 1,
        id: 'inv-2',
        type: 'graph.invalidated',
        payload: { repositoryId: 'repo-1' },
      };

      handleIncomingMessage(msg1);
      handleIncomingMessage(msg2);

      const commitRequests = postedMessages.filter((m) => m.type === 'commits.page.request');
      expect(commitRequests).toHaveLength(1);
    });

    it('stores remote list results', () => {
      handleIncomingMessage({
        protocolVersion: 1,
        id: 'remote-list-result',
        type: 'remote.list.result',
        payload: {
          repositoryId: 'repo-1',
          remotes: [
            {
              name: 'origin',
              fetchUrl: 'https://example.com/repo.git',
              pushUrl: 'https://example.com/repo.git',
            },
          ],
        },
      });

      expect(useRemoteStore.getState().remotes).toEqual([
        {
          name: 'origin',
          fetchUrl: 'https://example.com/repo.git',
          pushUrl: 'https://example.com/repo.git',
        },
      ]);
      expect(useRemoteStore.getState().isLoading).toBe(false);
    });

    it('stores reflog results', () => {
      handleIncomingMessage({
        protocolVersion: 1,
        id: 'reflog-result',
        type: 'reflog.recent.result',
        payload: {
          repositoryId: 'repo-1',
          entries: [
            {
              sha: 'abc',
              shortSha: 'abc1234',
              index: 0,
              selector: 'HEAD@{0}',
              subject: 'commit: test',
            },
          ],
        },
      });

      expect(useOperationStore.getState().reflogEntries).toHaveLength(1);
    });

    it('stores sync status results and requested dialogs', () => {
      handleIncomingMessage({
        protocolVersion: 1,
        id: 'sync-result',
        type: 'repository.syncStatus.result',
        payload: {
          repositoryId: 'repo-1',
          status: {
            repositoryId: 'repo-1',
            currentBranch: 'main',
            upstream: 'origin/main',
            ahead: 2,
            behind: 1,
          },
        },
      });
      handleIncomingMessage({
        protocolVersion: 1,
        id: 'dialog',
        type: 'ui.dialog.open',
        payload: { dialog: 'push' },
      });

      expect(useRepositoryStore.getState().syncStatus).toMatchObject({
        ahead: 2,
        behind: 1,
        upstream: 'origin/main',
      });
      expect(useUiStore.getState().requestedDialog).toBe('push');
    });

    it('stores undo metadata from operation results', () => {
      handleIncomingMessage({
        protocolVersion: 1,
        id: 'reset-result',
        type: 'operation.result',
        payload: {
          requestId: 'reset-1',
          success: true,
          undo: {
            available: true,
            label: 'reset',
            reflogIndex: 1,
            expectedSha: 'abc123',
          },
        },
      });

      expect(useOperationStore.getState().lastResult?.undo).toMatchObject({
        available: true,
        label: 'reset',
        expectedSha: 'abc123',
      });
    });

    it('executes trailing refresh after throttle delay so no invalidation is permanently dropped', () => {
      vi.useFakeTimers();
      try {
        useRepositoryStore
          .getState()
          .setRepositories([{ id: 'repo-1', name: 'Repo 1', path: '/r1' }]);
        postedMessages = [];

        const msg1: GraphInvalidatedMessage = {
          protocolVersion: 1,
          id: 'inv-1',
          type: 'graph.invalidated',
          payload: { repositoryId: 'repo-1' },
        };
        const msg2: GraphInvalidatedMessage = {
          protocolVersion: 1,
          id: 'inv-2',
          type: 'graph.invalidated',
          payload: { repositoryId: 'repo-1' },
        };

        handleIncomingMessage(msg1);
        expect(postedMessages.filter((m) => m.type === 'commits.page.request')).toHaveLength(1);

        // Second message within 350ms
        vi.advanceTimersByTime(100);
        handleIncomingMessage(msg2);
        expect(postedMessages.filter((m) => m.type === 'commits.page.request')).toHaveLength(1);

        // Trailing timer fires
        vi.advanceTimersByTime(300);
        expect(postedMessages.filter((m) => m.type === 'commits.page.request')).toHaveLength(2);
      } finally {
        resetInvalidationThrottle();
        vi.useRealTimers();
      }
    });

    it('resets isFetching when operation.result is received', () => {
      useGraphStore.getState().setIsFetching(true);
      expect(useGraphStore.getState().isFetching).toBe(true);

      handleIncomingMessage({
        protocolVersion: 1,
        id: 'fetch-result',
        type: 'operation.result',
        payload: {
          requestId: 'fetch-1',
          success: true,
        },
      });

      expect(useGraphStore.getState().isFetching).toBe(false);
    });

    it('does not surface cancelled operations as errors', () => {
      handleIncomingMessage({
        protocolVersion: 1,
        id: 'undo-cancelled',
        type: 'operation.result',
        payload: {
          requestId: 'undo-1',
          success: false,
          error: {
            code: AppErrorCode.OPERATION_CANCELLED,
            message: 'Undo cancelled.',
          },
        },
      });

      expect(useGraphStore.getState().error).toBeNull();
    });

    it('surfaces checkout failures from operation.result', () => {
      handleIncomingMessage({
        protocolVersion: 1,
        id: 'checkout-result',
        type: 'operation.result',
        payload: {
          requestId: 'checkout-1',
          success: false,
          error: {
            code: AppErrorCode.DIRTY_WORKTREE,
            message: 'Commit, stash, or discard changes before checkout.',
          },
        },
      });

      expect(useGraphStore.getState().error).toContain('Commit, stash, or discard');
    });

    it('handles notification.error message', () => {
      useGraphStore.getState().startLoadingPage({
        repositoryId: 'repo-1',
        requestId: 'req-err-target',
      });

      const msg: NotificationErrorMessage = {
        protocolVersion: 1,
        id: 'err-1',
        type: 'notification.error',
        payload: {
          code: AppErrorCode.GIT_COMMAND_FAILED,
          message: 'fatal: repository corrupt',
          requestId: 'req-err-target',
        },
      };

      handleIncomingMessage(msg);

      expect(useGraphStore.getState().error).toBe('fatal: repository corrupt');
      expect(useGraphStore.getState().isLoading).toBe(false);
    });

    it('requests commits page if commits are empty when repository ID transitions on same repo path', () => {
      useRepositoryStore
        .getState()
        .setRepositories(
          [{ id: 'repo-0', name: 'my-project', path: '/path/project' }],
          'repo-0',
          true,
        );
      useGraphStore.getState().setActiveRepoId('repo-0');
      postedMessages = [];

      handleIncomingMessage({
        protocolVersion: 1,
        id: 'list-1',
        type: 'repositories.list.result',
        payload: {
          repositories: [
            {
              id: 'repo-discovered',
              name: 'my-project',
              rootPath: '/path/project',
              gitDir: '/path/project/.git',
              isBare: false,
              path: '/path/project',
              currentBranch: 'Development',
            },
          ],
        },
      });

      expect(useRepositoryStore.getState().activeRepositoryId).toBe('repo-discovered');
      expect(useGraphStore.getState().activeRepoId).toBe('repo-discovered');
      const req = postedMessages.find((m) => m.type === 'commits.page.request');
      expect(req).toBeDefined();
      expect((req?.payload as { repositoryId: string }).repositoryId).toBe('repo-discovered');
    });

    it('accepts commits.page.result for initial placeholder ID repo-0 when active repo is discovered repo', () => {
      useRepositoryStore.getState().setRepositories(
        [
          {
            id: 'repo-discovered',
            name: 'my-project',
            path: '/path/project',
            currentBranch: 'Development',
          },
        ],
        'repo-discovered',
      );
      useGraphStore.getState().setActiveRepoId('repo-discovered');

      const msg: CommitsPageResultMessage = {
        protocolVersion: 1,
        id: 'c-page-1',
        type: 'commits.page.result',
        payload: {
          repositoryId: 'repo-0',
          page: {
            commits: [
              {
                sha: '1234567890abcdef1234567890abcdef12345678',
                shortSha: '1234567',
                parents: [],
                author: { name: 'Dev', email: 'dev@dev.com', timestamp: 0, timezone: '' },
                committer: { name: 'Dev', email: 'dev@dev.com', timestamp: 0, timezone: '' },
                subject: 'Initial commit',
                refs: [],
              },
            ],
            hasMore: false,
          },
        },
      };

      handleIncomingMessage(msg);

      expect(useGraphStore.getState().commits).toHaveLength(1);
      expect(useGraphStore.getState().commits[0]?.shortSha).toBe('1234567');
    });

    it('initMessageRouter sets up listener and dispatches app.ready', () => {
      const unsubscribe = initMessageRouter();

      const readyMsg = postedMessages.find((m) => m.type === 'app.ready');
      expect(readyMsg).toBeDefined();

      unsubscribe();
    });
  });
});
