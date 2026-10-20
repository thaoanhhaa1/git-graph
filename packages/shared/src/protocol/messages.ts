import type {
  RepositoryDescriptor,
  RepositoryPlaceholderItem,
  Commit,
  CommitPage,
  CommitOrdering,
  StashEntry,
  TagType,
  WorktreeStatus,
} from '../domain';
import { AppErrorCode, type SerializedAppError } from '../errors';

/**
 * Standard protocol envelope for communication between Extension Host and Webview.
 */
export interface MessageEnvelope<TType extends string = string, TPayload = unknown> {
  protocolVersion: 1;
  id: string;
  type: TType;
  requestId?: string;
  payload: TPayload;
}

// ---------------------------------------------------------------------------
// Webview -> Extension Payloads & Messages
// ---------------------------------------------------------------------------

export interface AppReadyPayload {
  timestamp?: number;
}
export type AppReadyMessage = MessageEnvelope<'app.ready', AppReadyPayload>;

export interface RepositoriesListRequestPayload {
  refresh?: boolean;
}
export type RepositoriesListRequestMessage = MessageEnvelope<
  'repositories.list.request',
  RepositoriesListRequestPayload
>;

export interface RepositorySelectPayload {
  repositoryId: string;
}
export type RepositorySelectMessage = MessageEnvelope<'repository.select', RepositorySelectPayload>;

import type { SearchType, ViewConfigUpdatePayload, FilterPathSetPayload } from './schemas';
export type { SearchType, ViewConfigUpdatePayload, FilterPathSetPayload };

export interface CommitsPageRequestPayload {
  repositoryId: string;
  limit?: number;
  cursor?: string;
  branch?: string;
  search?: string;
  searchType?: SearchType;
  author?: string;
  dateSince?: string;
  dateUntil?: string;
  path?: string;
  order?: CommitOrdering;
}
export type CommitsPageRequestMessage = MessageEnvelope<
  'commits.page.request',
  CommitsPageRequestPayload
>;

export interface CommitDetailsRequestPayload {
  repositoryId: string;
  sha: string;
  parentSha?: string;
  baseSha?: string;
  targetSha?: string;
}
export type CommitDetailsRequestMessage = MessageEnvelope<
  'commit.details.request',
  CommitDetailsRequestPayload
>;

export interface CommitDiffRequestPayload {
  repositoryId: string;
  sha: string;
  parentSha?: string;
  baseSha?: string;
  targetSha?: string;
  filePath?: string;
  maxBytes?: number;
  /** When true with the uncommitted pseudo-SHA, diff HEAD against the index. */
  staged?: boolean;
}
export type CommitDiffRequestMessage = MessageEnvelope<
  'commit.diff.request',
  CommitDiffRequestPayload
>;

export interface SearchRequestPayload {
  repositoryId: string;
  query: string;
  searchType?: SearchType;
}
export type SearchRequestMessage = MessageEnvelope<'search.request', SearchRequestPayload>;

export interface GraphRefreshRequestPayload {
  repositoryId?: string;
  hard?: boolean;
}
export type GraphRefreshRequestMessage = MessageEnvelope<
  'graph.refresh.request',
  GraphRefreshRequestPayload
>;

export type OperationCheckoutTargetType = 'localBranch' | 'remoteBranch' | 'tag' | 'commit';
export type OperationMergeFastForwardMode = 'ff' | 'no-ff' | 'ff-only';
export type OperationResetMode = 'soft' | 'mixed' | 'hard';
export type OperationSequencerAction = 'continue' | 'abort' | 'skip';

export interface OperationCheckoutRequestPayload {
  repositoryId: string;
  target: string;
  targetType?: OperationCheckoutTargetType;
  localBranchName?: string;
  /** @deprecated Use targetType: 'localBranch' instead. */
  isBranch?: boolean;
  noConfirm?: boolean;
}
export type OperationCheckoutRequestMessage = MessageEnvelope<
  'operation.checkout.request',
  OperationCheckoutRequestPayload
>;

export interface OperationBranchCreateRequestPayload {
  repositoryId: string;
  name?: string;
  startPoint?: string;
  checkout?: boolean;
}
export type OperationBranchCreateRequestMessage = MessageEnvelope<
  'operation.branch.create.request',
  OperationBranchCreateRequestPayload
>;

export interface OperationBranchRenameRequestPayload {
  repositoryId: string;
  oldName: string;
  newName: string;
  syncRemote?: boolean;
  remote?: string;
}
export type OperationBranchRenameRequestMessage = MessageEnvelope<
  'operation.branch.rename.request',
  OperationBranchRenameRequestPayload
>;

export interface OperationBranchDeleteRequestPayload {
  repositoryId: string;
  branchName: string;
  forceDelete?: boolean;
  deleteOnRemote?: boolean;
  remote?: string;
}
export type OperationBranchDeleteRequestMessage = MessageEnvelope<
  'operation.branch.delete.request',
  OperationBranchDeleteRequestPayload
>;

export interface OperationPushRequestPayload {
  repositoryId: string;
  branchName?: string;
  remote?: string;
  setUpstream?: boolean;
  force?: boolean;
}
export type OperationPushRequestMessage = MessageEnvelope<
  'operation.push.request',
  OperationPushRequestPayload
>;

export interface OperationTagCreateRequestPayload {
  repositoryId: string;
  name?: string;
  target: string;
  tagType?: TagType;
  message?: string;
  pushToRemote?: boolean;
  remote?: string;
}
export type OperationTagCreateRequestMessage = MessageEnvelope<
  'operation.tag.create.request',
  OperationTagCreateRequestPayload
>;

export interface OperationTagDeleteRequestPayload {
  repositoryId: string;
  tagName: string;
  deleteOnRemote?: boolean;
  remote?: string;
}
export type OperationTagDeleteRequestMessage = MessageEnvelope<
  'operation.tag.delete.request',
  OperationTagDeleteRequestPayload
>;

export interface OperationMergeRequestPayload {
  repositoryId: string;
  target: string;
  fastForwardMode?: OperationMergeFastForwardMode;
  squash?: boolean;
  noCommit?: boolean;
  exclusive?: boolean;
  targetBranch?: string;
  noConfirm?: boolean;
}
export type OperationMergeRequestMessage = MessageEnvelope<
  'operation.merge.request',
  OperationMergeRequestPayload
>;

export interface OperationMergeAbortRequestPayload {
  repositoryId: string;
}
export type OperationMergeAbortRequestMessage = MessageEnvelope<
  'operation.merge.abort.request',
  OperationMergeAbortRequestPayload
>;

export interface OperationRebaseRequestPayload {
  repositoryId: string;
  target: string;
  confirmedPublishedBranch?: boolean;
  ignoreDate?: boolean;
  noConfirm?: boolean;
}
export type OperationRebaseRequestMessage = MessageEnvelope<
  'operation.rebase.request',
  OperationRebaseRequestPayload
>;

export interface OperationRebaseActionRequestPayload {
  repositoryId: string;
}
export type OperationRebaseContinueRequestMessage = MessageEnvelope<
  'operation.rebase.continue.request',
  OperationRebaseActionRequestPayload
>;
export type OperationRebaseAbortRequestMessage = MessageEnvelope<
  'operation.rebase.abort.request',
  OperationRebaseActionRequestPayload
>;
export type OperationRebaseSkipRequestMessage = MessageEnvelope<
  'operation.rebase.skip.request',
  OperationRebaseActionRequestPayload
>;

export interface OperationCherryPickRequestPayload {
  repositoryId: string;
  commit: string;
  mainlineParent?: number;
  noCommit?: boolean;
  promptRange?: boolean;
  targetBranch?: string;
  noConfirm?: boolean;
}
export type OperationCherryPickRequestMessage = MessageEnvelope<
  'operation.cherryPick.request',
  OperationCherryPickRequestPayload
>;

export interface OperationRevertRequestPayload {
  repositoryId: string;
  commit: string;
  mainlineParent?: number;
  noConfirm?: boolean;
}
export type OperationRevertRequestMessage = MessageEnvelope<
  'operation.revert.request',
  OperationRevertRequestPayload
>;

export interface OperationSequencerActionRequestPayload {
  repositoryId: string;
}
export type OperationCherryPickContinueRequestMessage = MessageEnvelope<
  'operation.cherryPick.continue.request',
  OperationSequencerActionRequestPayload
>;
export type OperationCherryPickAbortRequestMessage = MessageEnvelope<
  'operation.cherryPick.abort.request',
  OperationSequencerActionRequestPayload
>;
export type OperationCherryPickSkipRequestMessage = MessageEnvelope<
  'operation.cherryPick.skip.request',
  OperationSequencerActionRequestPayload
>;
export type OperationRevertContinueRequestMessage = MessageEnvelope<
  'operation.revert.continue.request',
  OperationSequencerActionRequestPayload
>;
export type OperationRevertAbortRequestMessage = MessageEnvelope<
  'operation.revert.abort.request',
  OperationSequencerActionRequestPayload
>;
export type OperationRevertSkipRequestMessage = MessageEnvelope<
  'operation.revert.skip.request',
  OperationSequencerActionRequestPayload
>;

export interface OperationResetRequestPayload {
  repositoryId: string;
  target: string;
  mode: OperationResetMode;
  confirmedHardReset?: boolean;
}
export type OperationResetRequestMessage = MessageEnvelope<
  'operation.reset.request',
  OperationResetRequestPayload
>;

export interface OperationFetchRequestPayload {
  repositoryId: string;
  remote?: string;
  prune?: boolean;
}
export type OperationFetchRequestMessage = MessageEnvelope<
  'operation.fetch.request',
  OperationFetchRequestPayload
>;

export interface OperationCancelRequestPayload {
  requestId: string;
}
export type OperationCancelRequestMessage = MessageEnvelope<
  'operation.cancel.request',
  OperationCancelRequestPayload
>;

export interface DiffOpenRequestPayload {
  repositoryId: string;
  sha: string;
  parentSha?: string;
  baseSha?: string;
  targetSha?: string;
  filePath: string;
  oldFilePath?: string;
  /** When true, compare HEAD against the index instead of the working tree. */
  staged?: boolean;
}
export type DiffOpenRequestMessage = MessageEnvelope<'diff.open.request', DiffOpenRequestPayload>;

export interface FileOpenRevisionRequestPayload {
  repositoryId: string;
  sha?: string;
  filePath: string;
}
export type FileOpenRevisionRequestMessage = MessageEnvelope<
  'file.openRevision.request',
  FileOpenRevisionRequestPayload
>;

export interface WorktreeStatusRequestPayload {
  repositoryId: string;
}
export type WorktreeStatusRequestMessage = MessageEnvelope<
  'worktree.status.request',
  WorktreeStatusRequestPayload
>;

export interface WorktreeStageRequestPayload {
  repositoryId: string;
  paths: string[];
  all?: boolean;
}
export type WorktreeStageRequestMessage = MessageEnvelope<
  'worktree.stage.request',
  WorktreeStageRequestPayload
>;

export interface WorktreeUnstageRequestPayload {
  repositoryId: string;
  paths: string[];
  all?: boolean;
}
export type WorktreeUnstageRequestMessage = MessageEnvelope<
  'worktree.unstage.request',
  WorktreeUnstageRequestPayload
>;

export interface WorktreeDiscardRequestPayload {
  repositoryId: string;
  paths: string[];
  all?: boolean;
  untracked?: boolean;
  noConfirm?: boolean;
}
export type WorktreeDiscardRequestMessage = MessageEnvelope<
  'worktree.discard.request',
  WorktreeDiscardRequestPayload
>;

export interface OperationCommitCreateRequestPayload {
  repositoryId: string;
  message: string;
  description?: string;
  amend?: boolean;
}
export type OperationCommitCreateRequestMessage = MessageEnvelope<
  'operation.commit.create.request',
  OperationCommitCreateRequestPayload
>;

export interface StashListRequestPayload {
  repositoryId: string;
}
export type StashListRequestMessage = MessageEnvelope<
  'stash.list.request',
  StashListRequestPayload
>;

export interface StashSaveRequestPayload {
  repositoryId: string;
  message?: string;
  includeUntracked?: boolean;
  keepIndex?: boolean;
}
export type StashSaveRequestMessage = MessageEnvelope<
  'stash.save.request',
  StashSaveRequestPayload
>;

export interface StashActionRequestPayload {
  repositoryId: string;
  index: number;
}
export type StashPopRequestMessage = MessageEnvelope<
  'stash.pop.request',
  StashActionRequestPayload
>;
export type StashApplyRequestMessage = MessageEnvelope<
  'stash.apply.request',
  StashActionRequestPayload
>;
export type StashDropRequestMessage = MessageEnvelope<
  'stash.drop.request',
  StashActionRequestPayload
>;

export type ViewConfigUpdateMessage = MessageEnvelope<
  'view.config.update',
  ViewConfigUpdatePayload
>;

export type WebviewToExtensionMessage =
  | AppReadyMessage
  | RepositoriesListRequestMessage
  | RepositorySelectMessage
  | CommitsPageRequestMessage
  | CommitDetailsRequestMessage
  | CommitDiffRequestMessage
  | DiffOpenRequestMessage
  | FileOpenRevisionRequestMessage
  | WorktreeStatusRequestMessage
  | WorktreeStageRequestMessage
  | WorktreeUnstageRequestMessage
  | WorktreeDiscardRequestMessage
  | OperationCommitCreateRequestMessage
  | StashListRequestMessage
  | StashSaveRequestMessage
  | StashPopRequestMessage
  | StashApplyRequestMessage
  | StashDropRequestMessage
  | SearchRequestMessage
  | GraphRefreshRequestMessage
  | OperationCheckoutRequestMessage
  | OperationBranchCreateRequestMessage
  | OperationBranchRenameRequestMessage
  | OperationBranchDeleteRequestMessage
  | OperationPushRequestMessage
  | OperationTagCreateRequestMessage
  | OperationTagDeleteRequestMessage
  | OperationMergeRequestMessage
  | OperationMergeAbortRequestMessage
  | OperationRebaseRequestMessage
  | OperationRebaseContinueRequestMessage
  | OperationRebaseAbortRequestMessage
  | OperationRebaseSkipRequestMessage
  | OperationCherryPickRequestMessage
  | OperationCherryPickContinueRequestMessage
  | OperationCherryPickAbortRequestMessage
  | OperationCherryPickSkipRequestMessage
  | OperationRevertRequestMessage
  | OperationRevertContinueRequestMessage
  | OperationRevertAbortRequestMessage
  | OperationRevertSkipRequestMessage
  | OperationResetRequestMessage
  | OperationCancelRequestMessage
  | ViewConfigUpdateMessage;

// ---------------------------------------------------------------------------
// Extension -> Webview Payloads & Messages
// ---------------------------------------------------------------------------

export interface AppBootstrapPayload {
  protocolVersion: 1;
  repositories: (RepositoryDescriptor | RepositoryPlaceholderItem)[];
  activeRepositoryId?: string;
  theme?: string;
  initialFilterPath?: string;
  config?: {
    showAuthor?: boolean;
    showDate?: boolean;
    showRemoteBranches?: boolean;
    showTags?: boolean;
    dateType?: 'relative' | 'absolute' | 'default';
    pageSize?: number;
    commitOrdering?: CommitOrdering;
  };
}
export type AppBootstrapMessage = MessageEnvelope<'app.bootstrap', AppBootstrapPayload>;

export interface RepositoriesListResultPayload {
  requestId?: string;
  repositories: RepositoryDescriptor[];
}
export type RepositoriesListResultMessage = MessageEnvelope<
  'repositories.list.result',
  RepositoriesListResultPayload
>;

export interface RepositoryChangedPayload {
  activeRepositoryId: string;
}
export type RepositoryChangedMessage = MessageEnvelope<
  'repository.changed',
  RepositoryChangedPayload
>;

export interface CommitsPageResultPayload {
  requestId?: string;
  repositoryId: string;
  page: CommitPage;
  chunkIndex?: number;
  totalChunks?: number;
  isLastChunk?: boolean;
}
export type CommitsPageResultMessage = MessageEnvelope<
  'commits.page.result',
  CommitsPageResultPayload
>;

export interface CommitDetailsResultPayload {
  requestId?: string;
  repositoryId: string;
  commit: Commit;
}
export type CommitDetailsResultMessage = MessageEnvelope<
  'commit.details.result',
  CommitDetailsResultPayload
>;

export interface CommitDiffResultPayload {
  requestId?: string;
  repositoryId: string;
  sha: string;
  diff: string;
  parentSha?: string;
  baseSha?: string;
  targetSha?: string;
  filePath?: string;
  isTruncated?: boolean;
  isBinary?: boolean;
  truncatedBytes?: number;
  totalBytes?: number;
  staged?: boolean;
}
export type CommitDiffResultMessage = MessageEnvelope<
  'commit.diff.result',
  CommitDiffResultPayload
>;

export interface SearchResultPayload {
  requestId?: string;
  repositoryId: string;
  query: string;
  searchType?: SearchType;
  commits: Commit[];
}
export type SearchResultMessage = MessageEnvelope<'search.result', SearchResultPayload>;

export interface WorktreeStatusResultPayload {
  requestId?: string;
  repositoryId: string;
  status: WorktreeStatus;
}
export type WorktreeStatusResultMessage = MessageEnvelope<
  'worktree.status.result',
  WorktreeStatusResultPayload
>;

export interface StashListResultPayload {
  requestId?: string;
  repositoryId: string;
  stashes: StashEntry[];
}
export type StashListResultMessage = MessageEnvelope<'stash.list.result', StashListResultPayload>;

export interface GraphInvalidatedPayload {
  repositoryId?: string;
}
export type GraphInvalidatedMessage = MessageEnvelope<'graph.invalidated', GraphInvalidatedPayload>;

export interface OperationProgressPayload {
  requestId: string;
  progress: number;
  message?: string;
}
export type OperationProgressMessage = MessageEnvelope<
  'operation.progress',
  OperationProgressPayload
>;

export interface OperationResultPayload {
  requestId: string;
  success: boolean;
  error?: SerializedAppError;
  data?: unknown;
}
export type OperationResultMessage = MessageEnvelope<'operation.result', OperationResultPayload>;

export interface NotificationErrorPayload {
  code: AppErrorCode;
  message: string;
  details?: unknown;
  requestId?: string;
}
export type NotificationErrorMessage = MessageEnvelope<
  'notification.error',
  NotificationErrorPayload
>;

export type FilterPathSetMessage = MessageEnvelope<'filter.path.set', FilterPathSetPayload>;

export type ExtensionToWebviewMessage =
  | AppBootstrapMessage
  | RepositoriesListResultMessage
  | RepositoryChangedMessage
  | CommitsPageResultMessage
  | CommitDetailsResultMessage
  | CommitDiffResultMessage
  | SearchResultMessage
  | WorktreeStatusResultMessage
  | StashListResultMessage
  | GraphInvalidatedMessage
  | OperationProgressMessage
  | OperationResultMessage
  | NotificationErrorMessage
  | FilterPathSetMessage;

export type ProtocolMessage = WebviewToExtensionMessage | ExtensionToWebviewMessage;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export interface CreateMessageOptions {
  id?: string;
  requestId?: string;
}

export function createMessage<TType extends string, TPayload>(
  type: TType,
  payload: TPayload,
  optionsOrId?: CreateMessageOptions | string,
): MessageEnvelope<TType, TPayload> {
  const options: CreateMessageOptions =
    typeof optionsOrId === 'string' ? { id: optionsOrId } : optionsOrId || {};

  const id =
    options.id ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const message: MessageEnvelope<TType, TPayload> = {
    protocolVersion: 1,
    id,
    type,
    payload,
  };

  if (options.requestId) {
    message.requestId = options.requestId;
  }

  return message;
}

export function createErrorMessage(
  message: string,
  code: AppErrorCode = AppErrorCode.UNKNOWN_ERROR,
  details?: unknown,
  requestId?: string,
): NotificationErrorMessage {
  return createMessage<'notification.error', NotificationErrorPayload>(
    'notification.error',
    {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
    },
    requestId ? { requestId } : undefined,
  );
}
