import {
  AppErrorCode,
  createMessage,
  safeParseExtensionMessage,
  clampPageSize,
  DEFAULT_PAGE_SIZE,
  measureDeserialization,
  type ExtensionToWebviewMessage,
  type CommitsPageRequestPayload,
  type RepositorySelectPayload,
  type RepositoriesListRequestPayload,
  type CommitDetailsRequestPayload,
  type CommitDiffRequestPayload,
  type DiffOpenRequestPayload,
  type FileOpenRevisionRequestPayload,
  type SearchRequestPayload,
  type SearchType,
  type GraphRefreshRequestPayload,
  type OperationCheckoutRequestPayload,
  type OperationBranchCreateRequestPayload,
  type OperationBranchRenameRequestPayload,
  type OperationBranchDeleteRequestPayload,
  type OperationPushRequestPayload,
  type OperationPullRequestPayload,
  type OperationUndoRequestPayload,
  type RemoteListRequestPayload,
  type RemoteAddRequestPayload,
  type RemoteRemoveRequestPayload,
  type RemoteRenameRequestPayload,
  type RemoteSetUrlRequestPayload,
  type ReflogRecentRequestPayload,
  type RepositorySyncStatusRequestPayload,
  type OperationTagCreateRequestPayload,
  type OperationTagDeleteRequestPayload,
  type OperationMergeRequestPayload,
  type OperationMergeAbortRequestPayload,
  type OperationRebaseRequestPayload,
  type OperationRebaseActionRequestPayload,
  type RebaseInteractivePlanRequestPayload,
  type RebaseInteractiveStartRequestPayload,
  type RebaseInteractiveActionRequestPayload,
  type OperationCherryPickRequestPayload,
  type OperationRevertRequestPayload,
  type OperationSequencerActionRequestPayload,
  type OperationResetRequestPayload,
  type OperationFetchRequestPayload,
  type WorktreeStatusRequestPayload,
  type WorktreeStageRequestPayload,
  type WorktreeUnstageRequestPayload,
  type WorktreeDiscardRequestPayload,
  type GitWorktreeListRequestPayload,
  type GitWorktreeAddRequestPayload,
  type GitWorktreeRemoveRequestPayload,
  type GitWorktreeOpenRequestPayload,
  type SubmoduleListRequestPayload,
  type SubmoduleOpenRequestPayload,
  type OperationCommitCreateRequestPayload,
  type StashListRequestPayload,
  type StashSaveRequestPayload,
  type StashActionRequestPayload,
  type ViewConfigUpdatePayload,
  type CommitOrdering,
} from '@git-graph/shared';
import { postMessageToExtension, onMessageFromExtension } from './vscodeApi';
import { useRepositoryStore } from '../stores/repositoryStore';
import { useGraphStore } from '../stores/graphStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useDetailsStore } from '../stores/detailsStore';
import { useDiffStore } from '../stores/diffStore';
import { useWorktreeStore } from '../stores/worktreeStore';
import { useConfigStore } from '../stores/configStore';
import { useOperationStore } from '../stores/operationStore';
import { useRemoteStore } from '../stores/remoteStore';
import { useUiStore } from '../stores/uiStore';
import { useInteractiveRebaseStore } from '../stores/interactiveRebaseStore';
import { useGitWorktreeStore } from '../stores/gitWorktreeStore';
import { useSubmoduleStore } from '../stores/submoduleStore';
import { setLocale, t } from '../i18n';

export interface RequestCommitsOptions {
  repositoryId?: string;
  limit?: number;
  isNextPage?: boolean;
  refresh?: boolean;
  search?: string;
  searchType?: SearchType;
  author?: string;
  dateSince?: string;
  dateUntil?: string;
  path?: string;
  order?: CommitOrdering;
}

/**
 * Dispatches app.ready notification to the Extension Host to kick off handshake.
 */
export function notifyAppReady(): void {
  postMessageToExtension(createMessage('app.ready', { timestamp: Date.now() }));
}

/**
 * Requests discovery or refresh of the repository list.
 */
export function requestRepositoriesList(refresh = false): void {
  useRepositoryStore.getState().setLoading(true);
  postMessageToExtension(
    createMessage<'repositories.list.request', RepositoriesListRequestPayload>(
      'repositories.list.request',
      { refresh },
    ),
  );
}

/**
 * Selects an active repository, syncs state across stores, and requests its commit graph.
 */
export function selectRepository(repositoryId: string): void {
  useRepositoryStore.getState().setActiveRepositoryId(repositoryId);
  useSelectionStore.getState().clearSelection();
  useDetailsStore.getState().clearDetails();
  useDiffStore.getState().clearDiff();
  useWorktreeStore.getState().reset();
  useInteractiveRebaseStore.getState().reset();
  useGitWorktreeStore.getState().reset();
  useSubmoduleStore.getState().reset();
  useGraphStore.getState().resetGraph(repositoryId);

  postMessageToExtension(
    createMessage<'repository.select', RepositorySelectPayload>('repository.select', {
      repositoryId,
    }),
  );

  requestCommitsPage({ repositoryId });
  requestGitWorktreeList(repositoryId);
  requestSubmoduleList(repositoryId);
}

/**
 * Initiates commits page request (initial or paginated next page) with current branch/search filters.
 */
export function requestCommitsPage(options: RequestCommitsOptions = {}): string | null {
  const repoStore = useRepositoryStore.getState();
  const graphStore = useGraphStore.getState();

  const repositoryId = options.repositoryId || repoStore.activeRepositoryId;
  if (!repositoryId) {
    return null;
  }

  const isNextPage = Boolean(options.isNextPage);

  if (isNextPage) {
    if (
      !graphStore.hasMore ||
      graphStore.isLoadingMore ||
      graphStore.isLoading ||
      !graphStore.cursor
    ) {
      return null;
    }
  }

  const configuredPageSize = useConfigStore.getState().config.pageSize ?? DEFAULT_PAGE_SIZE;
  const resolvedLimit = clampPageSize(options.limit ?? configuredPageSize);

  const startResult = graphStore.startLoadingPage({
    repositoryId,
    isNextPage,
    preserveCommits:
      options.refresh ||
      (graphStore.commits.length > 0 && graphStore.activeRepoId === repositoryId),
  });

  if (startResult.ignored) {
    return null;
  }
  const requestId = startResult.requestId;

  const payload: CommitsPageRequestPayload = {
    repositoryId,
    limit: resolvedLimit,
    cursor: isNextPage ? graphStore.cursor : undefined,
    branch: graphStore.selectedBranch !== 'all' ? graphStore.selectedBranch : undefined,
    search: (options.search ?? graphStore.searchTerm).trim() || undefined,
    searchType: options.searchType ?? graphStore.searchType,
    author: (options.author ?? graphStore.filterAuthor).trim() || undefined,
    dateSince: (options.dateSince ?? graphStore.filterDateSince).trim() || undefined,
    dateUntil: (options.dateUntil ?? graphStore.filterDateUntil).trim() || undefined,
    path: (options.path ?? graphStore.filterPath).trim() || undefined,
    order: options.order ?? useConfigStore.getState().config.commitOrdering ?? 'date-order',
  };

  postMessageToExtension(
    createMessage<'commits.page.request', CommitsPageRequestPayload>(
      'commits.page.request',
      payload,
      { id: requestId, requestId },
    ),
  );

  return requestId;
}

/**
 * Dispatches view configuration updates to the extension to synchronize with VS Code settings.
 */
export function requestUpdateViewConfig(payload: ViewConfigUpdatePayload): void {
  postMessageToExtension(
    createMessage<'view.config.update', ViewConfigUpdatePayload>('view.config.update', payload),
  );
}

/**
 * Convenience helper to request the next page of commits.
 */
export function requestNextCommitsPage(limit?: number): string | null {
  return requestCommitsPage({ isNextPage: true, limit });
}

/**
 * Executes a full repository search via Git Core.
 */
export function requestRepositorySearch(query: string, searchType?: SearchType): void {
  const repositoryId = useRepositoryStore.getState().activeRepositoryId;
  if (!repositoryId || !query.trim()) {
    return;
  }
  postMessageToExtension(
    createMessage<'search.request', SearchRequestPayload>('search.request', {
      repositoryId,
      query: query.trim(),
      searchType,
    }),
  );
}

/**
 * Requests full details and file changes for a specific commit SHA.
 */
export function requestCommitDetails(repositoryId: string, sha: string, parentSha?: string): void {
  const payload: CommitDetailsRequestPayload = {
    repositoryId,
    sha,
    ...(parentSha ? { parentSha } : {}),
  };
  postMessageToExtension(
    createMessage<'commit.details.request', CommitDetailsRequestPayload>(
      'commit.details.request',
      payload,
    ),
  );
}

/**
 * Requests diff patch and statistics for a specific commit SHA and optional file path.
 */
export function requestCommitDiff(
  repositoryId: string,
  sha: string,
  filePath?: string,
  parentSha?: string,
  maxBytes?: number,
  staged?: boolean,
  baseSha?: string,
  targetSha?: string,
): void {
  const payload: CommitDiffRequestPayload = {
    repositoryId,
    sha,
    ...(filePath ? { filePath } : {}),
    ...(parentSha ? { parentSha } : {}),
    ...(baseSha ? { baseSha } : {}),
    ...(targetSha ? { targetSha } : {}),
    ...(maxBytes ? { maxBytes } : {}),
    ...(staged ? { staged: true } : {}),
  };
  postMessageToExtension(
    createMessage<'commit.diff.request', CommitDiffRequestPayload>('commit.diff.request', payload),
  );
}

/**
 * Requests opening diff in VS Code native diff editor.
 */
export function openDiffInVsCode(
  repositoryId: string,
  sha: string,
  filePath: string,
  parentSha?: string,
  oldFilePath?: string,
  staged?: boolean,
  baseSha?: string,
  targetSha?: string,
): void {
  const payload: DiffOpenRequestPayload = {
    repositoryId,
    sha,
    filePath,
    ...(parentSha ? { parentSha } : {}),
    ...(baseSha ? { baseSha } : {}),
    ...(targetSha ? { targetSha } : {}),
    ...(oldFilePath ? { oldFilePath } : {}),
    ...(staged ? { staged: true } : {}),
  };
  postMessageToExtension(
    createMessage<'diff.open.request', DiffOpenRequestPayload>('diff.open.request', payload),
  );
}

/**
 * Requests opening a file at a specific revision in VS Code editor.
 */
export function openFileAtRevisionInVsCode(
  repositoryId: string,
  filePath: string,
  sha?: string,
): void {
  const payload: FileOpenRevisionRequestPayload = {
    repositoryId,
    filePath,
    ...(sha ? { sha } : {}),
  };
  postMessageToExtension(
    createMessage<'file.openRevision.request', FileOpenRevisionRequestPayload>(
      'file.openRevision.request',
      payload,
    ),
  );
}

/**
 * Requests the current working tree/index status for a repository.
 */
export function requestWorktreeStatus(repositoryId?: string): string | null {
  const resolvedRepoId =
    repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!resolvedRepoId) {
    return null;
  }

  const requestId = `worktree-status-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'worktree.status.request', WorktreeStatusRequestPayload>(
      'worktree.status.request',
      { repositoryId: resolvedRepoId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Stages the given paths (or all changes) in the active repository.
 */
export function requestStageWorktree(
  payload: Omit<WorktreeStageRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `worktree-stage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'worktree.stage.request', WorktreeStageRequestPayload>(
      'worktree.stage.request',
      { ...payload, repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Unstages the given paths (or all staged changes) in the active repository.
 */
export function requestUnstageWorktree(
  payload: Omit<WorktreeUnstageRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `worktree-unstage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'worktree.unstage.request', WorktreeUnstageRequestPayload>(
      'worktree.unstage.request',
      { ...payload, repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Discards changes for the given paths (or all changes) in the active repository.
 */
export function requestDiscardWorktree(
  payload: Omit<WorktreeDiscardRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `worktree-discard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'worktree.discard.request', WorktreeDiscardRequestPayload>(
      'worktree.discard.request',
      { ...payload, repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests the list of linked Git worktrees for a repository.
 */
export function requestGitWorktreeList(repositoryId?: string): string | null {
  const resolvedRepoId =
    repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!resolvedRepoId) {
    return null;
  }

  const requestId = `worktree-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'worktree.list.request', GitWorktreeListRequestPayload>(
      'worktree.list.request',
      { repositoryId: resolvedRepoId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Adds a linked Git worktree.
 */
export function requestAddGitWorktree(
  payload: Omit<GitWorktreeAddRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `worktree-add-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  useOperationStore.getState().startOperation(requestId, t('worktree.create'));
  postMessageToExtension(
    createMessage<'worktree.add.request', GitWorktreeAddRequestPayload>(
      'worktree.add.request',
      { ...payload, repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Removes a linked Git worktree.
 */
export function requestRemoveGitWorktree(
  payload: Omit<GitWorktreeRemoveRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `worktree-remove-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  useOperationStore.getState().startOperation(requestId, t('worktree.remove'));
  postMessageToExtension(
    createMessage<'worktree.remove.request', GitWorktreeRemoveRequestPayload>(
      'worktree.remove.request',
      { ...payload, repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Opens a linked worktree in a new VS Code window.
 */
export function requestOpenGitWorktreeInNewWindow(
  payload: Omit<GitWorktreeOpenRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `worktree-open-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'worktree.open.request', GitWorktreeOpenRequestPayload>(
      'worktree.open.request',
      { ...payload, repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests configured submodules and their current state.
 */
export function requestSubmoduleList(repositoryId?: string): string | null {
  const resolvedRepoId =
    repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!resolvedRepoId) {
    return null;
  }

  const requestId = `submodule-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'submodule.list.request', SubmoduleListRequestPayload>(
      'submodule.list.request',
      { repositoryId: resolvedRepoId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Opens a submodule repository as a separate graph.
 */
export function requestOpenSubmodule(
  payload: Omit<SubmoduleOpenRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `submodule-open-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'submodule.open.request', SubmoduleOpenRequestPayload>(
      'submodule.open.request',
      { ...payload, repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Creates (or amends) a commit from staged changes in the active repository.
 */
export function requestCreateCommit(
  payload: Omit<OperationCommitCreateRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `commit-create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'operation.commit.create.request', OperationCommitCreateRequestPayload>(
      'operation.commit.create.request',
      { ...payload, repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests the stash list for a repository.
 */
export function requestStashList(repositoryId?: string): string | null {
  const resolvedRepoId =
    repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!resolvedRepoId) {
    return null;
  }

  const requestId = `stash-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'stash.list.request', StashListRequestPayload>(
      'stash.list.request',
      { repositoryId: resolvedRepoId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Saves current working tree changes into a stash.
 */
export function requestSaveStash(
  payload: Omit<StashSaveRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `stash-save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'stash.save.request', StashSaveRequestPayload>(
      'stash.save.request',
      { ...payload, repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

function requestStashAction(
  action: 'pop' | 'apply' | 'drop',
  payload: Omit<StashActionRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `stash-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const type = `stash.${action}.request` as const;
  postMessageToExtension(
    createMessage<typeof type, StashActionRequestPayload>(
      type,
      { repositoryId, index: payload.index },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

export function requestPopStash(index: number, repositoryId?: string): string | null {
  return requestStashAction('pop', { index, ...(repositoryId ? { repositoryId } : {}) });
}

export function requestApplyStash(index: number, repositoryId?: string): string | null {
  return requestStashAction('apply', { index, ...(repositoryId ? { repositoryId } : {}) });
}

export function requestDropStash(index: number, repositoryId?: string): string | null {
  return requestStashAction('drop', { index, ...(repositoryId ? { repositoryId } : {}) });
}

/**
 * Requests graph refresh (soft or hard).
 */
export function requestGraphRefresh(hard = false): void {
  const activeRepoId = useRepositoryStore.getState().activeRepositoryId;
  useRepositoryStore.getState().setLoading(true);
  postMessageToExtension(
    createMessage<'graph.refresh.request', GraphRefreshRequestPayload>('graph.refresh.request', {
      repositoryId: activeRepoId ?? undefined,
      hard,
    }),
  );

  if (hard) {
    requestRepositoriesList(true);
  }
}

/**
 * Requests fetch operation from remote(s) to refresh commits from remote.
 */
export function requestFetch(
  options: {
    repositoryId?: string;
    remote?: string;
    prune?: boolean;
    all?: boolean;
  } = {},
): string | null {
  const repositoryId =
    options.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  useGraphStore.getState().setIsFetching(true);
  const requestId = `fetch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  useOperationStore.getState().startOperation(requestId, 'Fetching from remote...');
  postMessageToExtension(
    createMessage<'operation.fetch.request', OperationFetchRequestPayload>(
      'operation.fetch.request',
      {
        repositoryId,
        remote: options.remote,
        prune: options.prune ?? true,
        ...(options.all !== undefined ? { all: options.all } : {}),
      },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

export function requestPull(
  payload: Omit<OperationPullRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  useGraphStore.getState().setIsFetching(true);
  const requestId = `pull-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  useOperationStore.getState().startOperation(requestId, 'Pulling from remote...');
  postMessageToExtension(
    createMessage<'operation.pull.request', OperationPullRequestPayload>(
      'operation.pull.request',
      { ...payload, repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

export function requestRemoteList(repositoryId?: string): string | null {
  const resolvedRepoId =
    repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!resolvedRepoId) {
    return null;
  }

  useRemoteStore.getState().startLoading(resolvedRepoId);
  const requestId = `remote-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'remote.list.request', RemoteListRequestPayload>(
      'remote.list.request',
      { repositoryId: resolvedRepoId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

export function requestAddRemote(
  payload: Omit<RemoteAddRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `remote-add-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  useOperationStore.getState().startOperation(requestId, 'Adding remote...');
  postMessageToExtension(
    createMessage<'remote.add.request', RemoteAddRequestPayload>(
      'remote.add.request',
      { ...payload, repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

export function requestRemoveRemote(
  payload: Omit<RemoteRemoveRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `remote-remove-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  useOperationStore.getState().startOperation(requestId, 'Removing remote...');
  postMessageToExtension(
    createMessage<'remote.remove.request', RemoteRemoveRequestPayload>(
      'remote.remove.request',
      { ...payload, repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

export function requestRenameRemote(
  payload: Omit<RemoteRenameRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `remote-rename-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  useOperationStore.getState().startOperation(requestId, 'Renaming remote...');
  postMessageToExtension(
    createMessage<'remote.rename.request', RemoteRenameRequestPayload>(
      'remote.rename.request',
      { ...payload, repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

export function requestSetRemoteUrl(
  payload: Omit<RemoteSetUrlRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `remote-set-url-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  useOperationStore.getState().startOperation(requestId, 'Updating remote URL...');
  postMessageToExtension(
    createMessage<'remote.setUrl.request', RemoteSetUrlRequestPayload>(
      'remote.setUrl.request',
      { ...payload, repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

export function requestReflogRecent(limit = 20, repositoryId?: string): string | null {
  const resolvedRepoId =
    repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!resolvedRepoId) {
    return null;
  }

  const requestId = `reflog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'reflog.recent.request', ReflogRecentRequestPayload>(
      'reflog.recent.request',
      { repositoryId: resolvedRepoId, limit },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

export function requestUndo(
  payload: Omit<OperationUndoRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  useGraphStore.getState().setIsFetching(true);
  useOperationStore.getState().startOperation(requestId, 'Undoing last operation...');
  postMessageToExtension(
    createMessage<'operation.undo.request', OperationUndoRequestPayload>(
      'operation.undo.request',
      { ...payload, repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

export function requestSyncStatus(repositoryId?: string): string | null {
  const resolvedRepoId =
    repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!resolvedRepoId) {
    return null;
  }

  const requestId = `sync-status-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'repository.syncStatus.request', RepositorySyncStatusRequestPayload>(
      'repository.syncStatus.request',
      { repositoryId: resolvedRepoId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests a guarded checkout operation for the active repository.
 */
export function requestCheckout(
  payload: Omit<OperationCheckoutRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  useGraphStore.getState().setIsFetching(true);
  const requestId = `checkout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'operation.checkout.request', OperationCheckoutRequestPayload>(
      'operation.checkout.request',
      {
        ...payload,
        repositoryId,
      },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests branch creation for the active repository.
 */
export function requestCreateBranch(
  payload: Omit<OperationBranchCreateRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  useGraphStore.getState().setIsFetching(true);
  const requestId = `branch-create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'operation.branch.create.request', OperationBranchCreateRequestPayload>(
      'operation.branch.create.request',
      {
        ...payload,
        repositoryId,
      },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests branch rename for the active repository.
 */
export function requestRenameBranch(
  payload: Omit<OperationBranchRenameRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  useGraphStore.getState().setIsFetching(true);
  const requestId = `branch-rename-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'operation.branch.rename.request', OperationBranchRenameRequestPayload>(
      'operation.branch.rename.request',
      {
        ...payload,
        repositoryId,
      },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests branch deletion for the active repository.
 */
export function requestDeleteBranch(
  payload: Omit<OperationBranchDeleteRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  useGraphStore.getState().setIsFetching(true);
  const requestId = `branch-delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'operation.branch.delete.request', OperationBranchDeleteRequestPayload>(
      'operation.branch.delete.request',
      {
        ...payload,
        repositoryId,
      },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests pushing a branch to remote for the active repository.
 */
export function requestPushBranch(
  payload: Omit<OperationPushRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  useGraphStore.getState().setIsFetching(true);
  const requestId = `branch-push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  useOperationStore.getState().startOperation(requestId, 'Pushing branch...');
  postMessageToExtension(
    createMessage<'operation.push.request', OperationPushRequestPayload>(
      'operation.push.request',
      {
        ...payload,
        repositoryId,
      },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests tag creation for the active repository.
 */
export function requestCreateTag(
  payload: Omit<OperationTagCreateRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  useGraphStore.getState().setIsFetching(true);
  const requestId = `tag-create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'operation.tag.create.request', OperationTagCreateRequestPayload>(
      'operation.tag.create.request',
      {
        ...payload,
        repositoryId,
      },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests deletion of a tag for the active repository.
 */
export function requestDeleteTag(
  payload: Omit<OperationTagDeleteRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  useGraphStore.getState().setIsFetching(true);
  const requestId = `tag-delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'operation.tag.delete.request', OperationTagDeleteRequestPayload>(
      'operation.tag.delete.request',
      {
        ...payload,
        repositoryId,
      },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests a guarded merge into the current branch for the active repository.
 */
export function requestMerge(
  payload: Omit<OperationMergeRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  useGraphStore.getState().setIsFetching(true);
  const requestId = `merge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'operation.merge.request', OperationMergeRequestPayload>(
      'operation.merge.request',
      {
        ...payload,
        repositoryId,
      },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests abort for the active in-progress merge.
 */
export function requestAbortMerge(
  payload: Partial<OperationMergeAbortRequestPayload> = {},
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `merge-abort-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'operation.merge.abort.request', OperationMergeAbortRequestPayload>(
      'operation.merge.abort.request',
      { repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests a guarded rebase of the current branch onto the target ref.
 */
export function requestRebase(
  payload: Omit<OperationRebaseRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `rebase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'operation.rebase.request', OperationRebaseRequestPayload>(
      'operation.rebase.request',
      {
        repositoryId,
        target: payload.target,
        ...(payload.confirmedPublishedBranch !== undefined
          ? { confirmedPublishedBranch: payload.confirmedPublishedBranch }
          : {}),
        ...(payload.ignoreDate !== undefined ? { ignoreDate: payload.ignoreDate } : {}),
        ...(payload.noConfirm !== undefined ? { noConfirm: payload.noConfirm } : {}),
      },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

export function requestRebaseAction(
  action: 'continue' | 'abort' | 'skip',
  payload: Partial<OperationRebaseActionRequestPayload> = {},
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `rebase-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const type = `operation.rebase.${action}.request` as const;
  postMessageToExtension(
    createMessage<typeof type, OperationRebaseActionRequestPayload>(
      type,
      { repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests an interactive rebase plan between the target commit and HEAD.
 */
export function requestInteractiveRebasePlan(onto: string, repositoryId?: string): string | null {
  const resolvedRepoId =
    repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!resolvedRepoId) {
    return null;
  }

  const requestId = `interactive-rebase-plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'rebase.interactive.plan.request', RebaseInteractivePlanRequestPayload>(
      'rebase.interactive.plan.request',
      { repositoryId: resolvedRepoId, onto },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

export function requestInteractiveRebaseStart(
  payload: Omit<RebaseInteractiveStartRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `interactive-rebase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  useInteractiveRebaseStore.getState().startRebase(requestId);
  postMessageToExtension(
    createMessage<'rebase.interactive.start.request', RebaseInteractiveStartRequestPayload>(
      'rebase.interactive.start.request',
      {
        ...payload,
        repositoryId,
      },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

export function requestInteractiveRebaseAction(
  action: 'continue' | 'abort' | 'skip',
  payload: Partial<RebaseInteractiveActionRequestPayload> = {},
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `interactive-rebase-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const store = useInteractiveRebaseStore.getState();
  if (action === 'continue') {
    store.continueRebase(requestId);
  } else if (action === 'abort') {
    store.abortRebase(requestId);
  } else {
    store.skipRebase(requestId);
  }

  const type = `rebase.interactive.${action}` as const;
  postMessageToExtension(
    createMessage<typeof type, RebaseInteractiveActionRequestPayload>(
      type,
      { repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests a guarded cherry-pick of the specified commit.
 */
export function requestCherryPick(
  payload: Omit<OperationCherryPickRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `cherryPick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'operation.cherryPick.request', OperationCherryPickRequestPayload>(
      'operation.cherryPick.request',
      {
        repositoryId,
        commit: payload.commit,
        ...(payload.mainlineParent ? { mainlineParent: payload.mainlineParent } : {}),
        ...(payload.noCommit !== undefined ? { noCommit: payload.noCommit } : {}),
        ...(payload.promptRange !== undefined ? { promptRange: payload.promptRange } : {}),
        ...(payload.targetBranch ? { targetBranch: payload.targetBranch } : {}),
        ...(payload.noConfirm !== undefined ? { noConfirm: payload.noConfirm } : {}),
      },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests a sequencer action (continue/abort/skip) for an in-progress cherry-pick.
 */
export function requestCherryPickAction(
  action: 'continue' | 'abort' | 'skip',
  payload: Partial<OperationSequencerActionRequestPayload> = {},
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `cherryPick-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const type = `operation.cherryPick.${action}.request` as const;
  postMessageToExtension(
    createMessage<typeof type, OperationSequencerActionRequestPayload>(
      type,
      { repositoryId },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests a guarded revert of the specified commit.
 */
export function requestRevert(
  payload: Omit<OperationRevertRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `revert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'operation.revert.request', OperationRevertRequestPayload>(
      'operation.revert.request',
      {
        repositoryId,
        commit: payload.commit,
        ...(payload.mainlineParent ? { mainlineParent: payload.mainlineParent } : {}),
        ...(payload.noConfirm !== undefined ? { noConfirm: payload.noConfirm } : {}),
      },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

/**
 * Requests reset of the current branch/index/worktree to the target commit.
 */
export function requestReset(
  payload: Omit<OperationResetRequestPayload, 'repositoryId'> & { repositoryId?: string },
): string | null {
  const repositoryId =
    payload.repositoryId ?? useRepositoryStore.getState().activeRepositoryId ?? undefined;
  if (!repositoryId) {
    return null;
  }

  const requestId = `reset-${payload.mode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postMessageToExtension(
    createMessage<'operation.reset.request', OperationResetRequestPayload>(
      'operation.reset.request',
      {
        repositoryId,
        target: payload.target,
        mode: payload.mode,
        ...(payload.confirmedHardReset !== undefined
          ? { confirmedHardReset: payload.confirmedHardReset }
          : {}),
      },
      { id: requestId, requestId },
    ),
  );
  return requestId;
}

let lastInvalidationTime = 0;
let lastInvalidatedRepoId: string | null = null;
let pendingRevealSha: string | null = null;
let pendingRevealSearchAttempted = false;

export function resetPendingReveal(): void {
  pendingRevealSha = null;
  pendingRevealSearchAttempted = false;
}

function applyPendingReveal(): void {
  const sha = pendingRevealSha;
  if (!sha) {
    return;
  }

  const graph = useGraphStore.getState();
  if (graph.commits.some((commit) => commit.sha === sha || commit.shortSha === sha)) {
    pendingRevealSha = null;
    pendingRevealSearchAttempted = false;
    graph.setRevealCommitSha(sha);
    useSelectionStore.getState().selectCommit(sha);
    return;
  }

  if (graph.hasMore) {
    requestNextCommitsPage();
    return;
  }

  if (pendingRevealSearchAttempted) {
    pendingRevealSha = null;
    pendingRevealSearchAttempted = false;
    return;
  }

  pendingRevealSearchAttempted = true;
  graph.setSearchType('hash');
  graph.setSearchTerm(sha);
  requestRepositorySearch(sha, 'hash');
}

export function resetInvalidationThrottle(): void {
  lastInvalidationTime = 0;
  lastInvalidatedRepoId = null;
}

/**
 * Routes typed extension messages to their respective stores.
 */
export function routeExtensionMessage(envelope: ExtensionToWebviewMessage): void {
  switch (envelope.type) {
    case 'app.bootstrap': {
      const { repositories, activeRepositoryId, config, initialFilterPath, locale } =
        envelope.payload;
      setLocale(locale);
      if (config) {
        useConfigStore.getState().updateConfig(config);
      }
      if (initialFilterPath) {
        useGraphStore.getState().setFilterPath(initialFilterPath);
      }
      useRepositoryStore.getState().setRepositories(repositories, activeRepositoryId, true);

      const resolvedActiveId = useRepositoryStore.getState().activeRepositoryId;
      if (resolvedActiveId) {
        useGraphStore.getState().setActiveRepoId(resolvedActiveId);
        requestCommitsPage({ repositoryId: resolvedActiveId });
        requestGitWorktreeList(resolvedActiveId);
        requestSubmoduleList(resolvedActiveId);
      }
      break;
    }

    case 'view.config.changed': {
      useConfigStore.getState().updateConfig(envelope.payload);
      break;
    }

    case 'repositories.list.result': {
      const { repositories } = envelope.payload;
      const previousActiveRepo = useRepositoryStore.getState().getActiveRepository();
      const previousActiveId = useRepositoryStore.getState().activeRepositoryId;
      useRepositoryStore.getState().setRepositories(repositories);

      const newActiveId = useRepositoryStore.getState().activeRepositoryId;
      const newActiveRepo = useRepositoryStore.getState().getActiveRepository();
      if (newActiveId && newActiveId !== previousActiveId) {
        const isSameRepoPath =
          previousActiveRepo &&
          newActiveRepo &&
          Boolean(previousActiveRepo.path) &&
          previousActiveRepo.path === newActiveRepo.path;

        if (isSameRepoPath) {
          useGraphStore.getState().setActiveRepoId(newActiveId);
          if (useGraphStore.getState().commits.length === 0) {
            requestCommitsPage({ repositoryId: newActiveId });
          }
        } else {
          useSelectionStore.getState().clearSelection();
          useGraphStore.getState().resetGraph(newActiveId);
          requestCommitsPage({ repositoryId: newActiveId });
        }
        requestGitWorktreeList(newActiveId);
        requestSubmoduleList(newActiveId);
      }
      break;
    }

    case 'repository.changed': {
      const { activeRepositoryId } = envelope.payload;
      useRemoteStore.getState().reset();
      useOperationStore.getState().reset();
      const repoStore = useRepositoryStore.getState();
      repoStore.setActiveRepositoryId(activeRepositoryId);
      useSelectionStore.getState().clearSelection();
      useDetailsStore.getState().clearDetails();
      useDiffStore.getState().clearDiff();
      useWorktreeStore.getState().reset();
      useInteractiveRebaseStore.getState().reset();
      useGitWorktreeStore.getState().reset();
      useSubmoduleStore.getState().reset();
      useGraphStore.getState().resetGraph(activeRepositoryId);
      requestCommitsPage({ repositoryId: activeRepositoryId });
      requestGitWorktreeList(activeRepositoryId);
      requestSubmoduleList(activeRepositoryId);
      break;
    }

    case 'commits.page.result': {
      const { repositoryId, page, requestId, chunkIndex, totalChunks, isLastChunk } =
        envelope.payload;
      useGraphStore.getState().receiveCommitsPage({
        repositoryId,
        page,
        requestId,
        chunkIndex,
        totalChunks,
        isLastChunk,
      });
      if (isLastChunk !== false) {
        applyPendingReveal();
      }
      break;
    }

    case 'commit.details.result': {
      const { repositoryId, commit } = envelope.payload;
      useDetailsStore.getState().receiveDetails(repositoryId, commit);
      break;
    }

    case 'commit.diff.result': {
      useDiffStore.getState().receiveDiff(envelope.payload);
      break;
    }

    case 'worktree.status.result': {
      const { repositoryId, status } = envelope.payload;
      useWorktreeStore.getState().receiveStatus(repositoryId, status);
      break;
    }

    case 'worktree.list.result': {
      const { repositoryId, worktrees, currentPath } = envelope.payload;
      useGitWorktreeStore.getState().receiveWorktrees(repositoryId, worktrees, currentPath);
      break;
    }

    case 'submodule.list.result': {
      const { repositoryId, submodules } = envelope.payload;
      useSubmoduleStore.getState().receiveSubmodules(repositoryId, submodules);
      break;
    }

    case 'stash.list.result': {
      const { repositoryId, stashes } = envelope.payload;
      useWorktreeStore.getState().receiveStashes(repositoryId, stashes);
      break;
    }

    case 'search.result': {
      const { repositoryId, commits, requestId } = envelope.payload;
      useGraphStore.getState().receiveCommitsPage({
        repositoryId,
        page: { commits, hasMore: false },
        requestId,
      });
      useGraphStore.getState().setSearchMatches(commits.map((c) => c.sha));
      applyPendingReveal();
      break;
    }

    case 'graph.reveal.commit': {
      const { repositoryId, sha } = envelope.payload;
      const activeRepoId = useRepositoryStore.getState().activeRepositoryId;
      pendingRevealSha = sha;
      pendingRevealSearchAttempted = false;
      if (repositoryId && repositoryId !== activeRepoId) {
        selectRepository(repositoryId);
      } else {
        applyPendingReveal();
      }
      break;
    }

    case 'graph.invalidated': {
      const { repositoryId } = envelope.payload;
      const activeRepoId = useRepositoryStore.getState().activeRepositoryId;
      if (!repositoryId || (activeRepoId && repositoryId === activeRepoId)) {
        if (activeRepoId) {
          const now = Date.now();
          if (lastInvalidatedRepoId === activeRepoId && now - lastInvalidationTime < 350) {
            break;
          }
          lastInvalidationTime = now;
          lastInvalidatedRepoId = activeRepoId;
          const worktreeRepoId = useWorktreeStore.getState().repositoryId;
          if (worktreeRepoId === activeRepoId) {
            requestWorktreeStatus(activeRepoId);
            requestStashList(activeRepoId);
          }
          requestCommitsPage({ repositoryId: activeRepoId, refresh: true });
        }
      }
      break;
    }

    case 'operation.progress': {
      useOperationStore.getState().updateProgress(envelope.payload);
      useInteractiveRebaseStore.getState().receiveProgress(envelope.payload);
      if (envelope.payload.progress < 1.0) {
        useGraphStore.getState().setIsFetching(true);
      }
      break;
    }

    case 'operation.result': {
      useOperationStore.getState().receiveResult(envelope.payload);
      useInteractiveRebaseStore.getState().receiveResult(envelope.payload);
      useGraphStore.getState().setIsFetching(false);
      if (
        !envelope.payload.success &&
        envelope.payload.error &&
        envelope.payload.error.code !== AppErrorCode.OPERATION_CANCELLED
      ) {
        useGraphStore.getState().setError(envelope.payload.error.message);
      }
      break;
    }

    case 'remote.list.result': {
      useRemoteStore
        .getState()
        .receiveRemotes(envelope.payload.repositoryId, envelope.payload.remotes);
      break;
    }

    case 'reflog.recent.result': {
      useOperationStore.getState().receiveReflog(envelope.payload.entries);
      break;
    }

    case 'rebase.interactive.plan.result': {
      const { entries, onto, error } = envelope.payload;
      useInteractiveRebaseStore.getState().receivePlan(entries, onto, error);
      break;
    }

    case 'repository.syncStatus.result': {
      useRepositoryStore.getState().setSyncStatus(envelope.payload.status);
      break;
    }

    case 'ui.dialog.open': {
      useUiStore.getState().requestDialog(envelope.payload.dialog);
      break;
    }

    case 'notification.error': {
      useGraphStore.getState().setIsFetching(false);
      const { message, requestId } = envelope.payload;
      if (requestId?.startsWith('worktree-list-')) {
        useGitWorktreeStore.getState().setError(message);
        break;
      }
      if (requestId?.startsWith('submodule-list-')) {
        useSubmoduleStore.getState().setError(message);
        break;
      }
      useGraphStore.getState().setError(message, requestId);
      break;
    }

    case 'filter.path.set': {
      const { path, repositoryId } = envelope.payload;
      if (repositoryId) {
        useRepositoryStore.getState().setActiveRepositoryId(repositoryId);
        useGraphStore.getState().setActiveRepoId(repositoryId);
      }
      useGraphStore.getState().setFilterPath(path);
      useSelectionStore.getState().clearSelection();
      requestCommitsPage();
      break;
    }

    default:
      break;
  }
}

/**
 * Handles raw window message events, parses them safely, and routes them.
 */
export function handleIncomingMessage(eventData: unknown): boolean {
  if (typeof eventData === 'string' && eventData.length > 50000) {
    measureDeserialization(eventData);
  }
  const parseResult = safeParseExtensionMessage(eventData);
  if (!parseResult.success) {
    return false;
  }

  routeExtensionMessage(parseResult.data);
  return true;
}

/**
 * Subscribes to window message events and starts the initial handshake with the Extension Host.
 * Returns an unbind callback to remove the event listener.
 */
export function initMessageRouter(): () => void {
  const unsubscribe = onMessageFromExtension((event: MessageEvent) => {
    handleIncomingMessage(event.data);
  });

  notifyAppReady();

  return () => {
    unsubscribe();
  };
}
