import { z } from 'zod';
import {
  RepositoryDescriptorSchema,
  RepositoryPlaceholderItemSchema,
  CommitSchema,
  CommitPageSchema,
  CommitOrderingSchema,
  StashEntrySchema,
  TagTypeSchema,
  WorktreeStatusSchema,
} from '../domain';
import { AppErrorCodeSchema, SerializedAppErrorSchema, AppError, AppErrorCode } from '../errors';

// ---------------------------------------------------------------------------
// Envelope Schemas
// ---------------------------------------------------------------------------

export const MessageEnvelopeHeaderSchema = z.object({
  protocolVersion: z.literal(1),
  id: z.string().min(1),
  type: z.string().min(1),
  requestId: z.string().optional(),
});

export function createMessageEnvelopeSchema<
  TType extends string,
  TPayloadSchema extends z.ZodTypeAny,
>(type: TType, payloadSchema: TPayloadSchema) {
  return z.object({
    protocolVersion: z.literal(1),
    id: z.string().min(1),
    type: z.literal(type),
    requestId: z.string().optional(),
    payload: payloadSchema,
  });
}

// ---------------------------------------------------------------------------
// Webview -> Extension Payload Schemas
// ---------------------------------------------------------------------------

export const AppReadyPayloadSchema = z.object({
  timestamp: z.number().optional(),
});

export const RepositoriesListRequestPayloadSchema = z.object({
  refresh: z.boolean().optional(),
});

export const RepositorySelectPayloadSchema = z.object({
  repositoryId: z.string().min(1),
});

export const SearchTypeSchema = z.enum(['all', 'subject', 'author', 'hash', 'ref']);
export type SearchType = z.infer<typeof SearchTypeSchema>;

export const CommitsPageRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  limit: z.number().int().positive().optional(),
  cursor: z.string().optional(),
  branch: z.string().optional(),
  search: z.string().optional(),
  searchType: SearchTypeSchema.optional(),
  author: z.string().optional(),
  dateSince: z.string().optional(),
  dateUntil: z.string().optional(),
  path: z.string().optional(),
  order: CommitOrderingSchema.optional(),
});

export const CommitDetailsRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  sha: z.string().min(1),
  parentSha: z.string().optional(),
  baseSha: z.string().optional(),
  targetSha: z.string().optional(),
});

export const CommitDiffRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  sha: z.string().min(1),
  parentSha: z.string().optional(),
  baseSha: z.string().optional(),
  targetSha: z.string().optional(),
  filePath: z.string().optional(),
  maxBytes: z.number().int().positive().optional(),
  staged: z.boolean().optional(),
});

export const DiffOpenRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  sha: z.string().min(1),
  parentSha: z.string().optional(),
  baseSha: z.string().optional(),
  targetSha: z.string().optional(),
  filePath: z.string().min(1),
  oldFilePath: z.string().optional(),
  staged: z.boolean().optional(),
});

export const FileOpenRevisionRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  sha: z.string().optional(),
  filePath: z.string().min(1),
});

export const WorktreeStatusRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
});

const WorktreePathsSchema = z.object({
  repositoryId: z.string().min(1),
  paths: z.array(z.string().min(1)),
  all: z.boolean().optional(),
});

export const WorktreeStageRequestPayloadSchema = WorktreePathsSchema;

export const WorktreeUnstageRequestPayloadSchema = WorktreePathsSchema;

export const WorktreeDiscardRequestPayloadSchema = WorktreePathsSchema.extend({
  untracked: z.boolean().optional(),
  noConfirm: z.boolean().optional(),
});

export const OperationCommitCreateRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  message: z.string().min(1),
  description: z.string().optional(),
  amend: z.boolean().optional(),
});

export const StashListRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
});

export const StashSaveRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  message: z.string().optional(),
  includeUntracked: z.boolean().optional(),
  keepIndex: z.boolean().optional(),
});

export const StashActionRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  index: z.number().int().nonnegative(),
});

export const SearchRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  query: z.string().min(1),
  searchType: SearchTypeSchema.optional(),
});

export const GraphRefreshRequestPayloadSchema = z.object({
  repositoryId: z.string().optional(),
  hard: z.boolean().optional(),
});

export const OperationCheckoutTargetTypeSchema = z.enum([
  'localBranch',
  'remoteBranch',
  'tag',
  'commit',
]);

export const OperationMergeFastForwardModeSchema = z.enum(['ff', 'no-ff', 'ff-only']);
export const OperationResetModeSchema = z.enum(['soft', 'mixed', 'hard']);

export const OperationCheckoutRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  target: z.string().min(1),
  targetType: OperationCheckoutTargetTypeSchema.optional(),
  localBranchName: z.string().min(1).optional(),
  isBranch: z.boolean().optional(),
  noConfirm: z.boolean().optional(),
});

export const OperationBranchCreateRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  name: z.string().min(1).optional(),
  startPoint: z.string().min(1).optional(),
  checkout: z.boolean().optional(),
});

export const OperationBranchRenameRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  oldName: z.string().min(1),
  newName: z.string().min(1),
  syncRemote: z.boolean().optional(),
  remote: z.string().min(1).optional(),
});

export const OperationBranchDeleteRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  branchName: z.string().min(1),
  forceDelete: z.boolean().optional(),
  deleteOnRemote: z.boolean().optional(),
  remote: z.string().min(1).optional(),
});

export const OperationPushRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  branchName: z.string().min(1).optional(),
  remote: z.string().min(1).optional(),
  setUpstream: z.boolean().optional(),
  force: z.boolean().optional(),
});

export const OperationTagCreateRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  name: z.string().min(1).optional(),
  target: z.string().min(1),
  tagType: TagTypeSchema.optional(),
  message: z.string().optional(),
  pushToRemote: z.boolean().optional(),
  remote: z.string().min(1).optional(),
});

export const OperationTagDeleteRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  tagName: z.string().min(1),
  deleteOnRemote: z.boolean().optional(),
  remote: z.string().min(1).optional(),
});

export const OperationMergeRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  target: z.string().min(1),
  fastForwardMode: OperationMergeFastForwardModeSchema.optional(),
  squash: z.boolean().optional(),
  noCommit: z.boolean().optional(),
  exclusive: z.boolean().optional(),
  targetBranch: z.string().optional(),
  noConfirm: z.boolean().optional(),
});

export const OperationMergeAbortRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
});

export const OperationRebaseRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  target: z.string().min(1),
  confirmedPublishedBranch: z.boolean().optional(),
  ignoreDate: z.boolean().optional(),
  noConfirm: z.boolean().optional(),
});

export const OperationRebaseActionRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
});

export const OperationCherryPickRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  commit: z.string().min(1),
  mainlineParent: z.number().int().positive().optional(),
  noCommit: z.boolean().optional(),
  promptRange: z.boolean().optional(),
  targetBranch: z.string().optional(),
  noConfirm: z.boolean().optional(),
});

export const OperationRevertRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  commit: z.string().min(1),
  mainlineParent: z.number().int().positive().optional(),
  noConfirm: z.boolean().optional(),
});

export const OperationSequencerActionRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
});

export const OperationResetRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  target: z.string().min(1),
  mode: OperationResetModeSchema,
  confirmedHardReset: z.boolean().optional(),
});

export const OperationFetchRequestPayloadSchema = z.object({
  repositoryId: z.string().min(1),
  remote: z.string().optional(),
  prune: z.boolean().optional(),
});

export const OperationCancelRequestPayloadSchema = z.object({
  requestId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Extension -> Webview Payload Schemas
// ---------------------------------------------------------------------------

export const AppBootstrapPayloadSchema = z.object({
  protocolVersion: z.literal(1),
  repositories: z.array(z.union([RepositoryDescriptorSchema, RepositoryPlaceholderItemSchema])),
  activeRepositoryId: z.string().optional(),
  theme: z.string().optional(),
  initialFilterPath: z.string().optional(),
  config: z
    .object({
      showAuthor: z.boolean().optional(),
      showDate: z.boolean().optional(),
      showRemoteBranches: z.boolean().optional(),
      showTags: z.boolean().optional(),
      dateType: z.enum(['relative', 'absolute', 'default']).optional(),
      pageSize: z.number().int().positive().optional(),
      commitOrdering: CommitOrderingSchema.optional(),
    })
    .optional(),
});

export const FilterPathSetPayloadSchema = z.object({
  path: z.string(),
  repositoryId: z.string().optional(),
});
export type FilterPathSetPayload = z.infer<typeof FilterPathSetPayloadSchema>;

export const ViewConfigUpdatePayloadSchema = z.object({
  commitOrdering: CommitOrderingSchema.optional(),
  showAuthor: z.boolean().optional(),
  showDate: z.boolean().optional(),
  showRemoteBranches: z.boolean().optional(),
  showTags: z.boolean().optional(),
  dateType: z.enum(['relative', 'absolute', 'default']).optional(),
  pageSize: z.number().int().positive().optional(),
});
export type ViewConfigUpdatePayload = z.infer<typeof ViewConfigUpdatePayloadSchema>;

export const RepositoriesListResultPayloadSchema = z.object({
  requestId: z.string().optional(),
  repositories: z.array(RepositoryDescriptorSchema),
});

export const RepositoryChangedPayloadSchema = z.object({
  activeRepositoryId: z.string().min(1),
});

export const CommitsPageResultPayloadSchema = z.object({
  requestId: z.string().optional(),
  repositoryId: z.string().min(1),
  page: CommitPageSchema,
  chunkIndex: z.number().int().nonnegative().optional(),
  totalChunks: z.number().int().positive().optional(),
  isLastChunk: z.boolean().optional(),
});

export const CommitDetailsResultPayloadSchema = z.object({
  requestId: z.string().optional(),
  repositoryId: z.string().min(1),
  commit: CommitSchema,
});

export const CommitDiffResultPayloadSchema = z.object({
  requestId: z.string().optional(),
  repositoryId: z.string().min(1),
  sha: z.string().min(1),
  diff: z.string(),
  parentSha: z.string().optional(),
  baseSha: z.string().optional(),
  targetSha: z.string().optional(),
  filePath: z.string().optional(),
  isTruncated: z.boolean().optional(),
  isBinary: z.boolean().optional(),
  truncatedBytes: z.number().int().nonnegative().optional(),
  totalBytes: z.number().int().nonnegative().optional(),
  staged: z.boolean().optional(),
});

export const GraphInvalidatedPayloadSchema = z.object({
  repositoryId: z.string().optional(),
});

export const SearchResultPayloadSchema = z.object({
  requestId: z.string().optional(),
  repositoryId: z.string().min(1),
  query: z.string(),
  searchType: SearchTypeSchema.optional(),
  commits: z.array(CommitSchema),
});

export const WorktreeStatusResultPayloadSchema = z.object({
  requestId: z.string().optional(),
  repositoryId: z.string().min(1),
  status: WorktreeStatusSchema,
});

export const StashListResultPayloadSchema = z.object({
  requestId: z.string().optional(),
  repositoryId: z.string().min(1),
  stashes: z.array(StashEntrySchema),
});

export const OperationProgressPayloadSchema = z.object({
  requestId: z.string().min(1),
  progress: z.number().min(0).max(100),
  message: z.string().optional(),
});

export const OperationResultPayloadSchema = z.object({
  requestId: z.string().min(1),
  success: z.boolean(),
  error: SerializedAppErrorSchema.optional(),
  data: z.unknown().optional(),
});

export const NotificationErrorPayloadSchema = z.object({
  code: AppErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
  requestId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Discriminated Envelopes
// ---------------------------------------------------------------------------

export const WebviewToExtensionMessageSchema = z.discriminatedUnion('type', [
  createMessageEnvelopeSchema('app.ready', AppReadyPayloadSchema),
  createMessageEnvelopeSchema('repositories.list.request', RepositoriesListRequestPayloadSchema),
  createMessageEnvelopeSchema('repository.select', RepositorySelectPayloadSchema),
  createMessageEnvelopeSchema('commits.page.request', CommitsPageRequestPayloadSchema),
  createMessageEnvelopeSchema('commit.details.request', CommitDetailsRequestPayloadSchema),
  createMessageEnvelopeSchema('commit.diff.request', CommitDiffRequestPayloadSchema),
  createMessageEnvelopeSchema('diff.open.request', DiffOpenRequestPayloadSchema),
  createMessageEnvelopeSchema('file.openRevision.request', FileOpenRevisionRequestPayloadSchema),
  createMessageEnvelopeSchema('worktree.status.request', WorktreeStatusRequestPayloadSchema),
  createMessageEnvelopeSchema('worktree.stage.request', WorktreeStageRequestPayloadSchema),
  createMessageEnvelopeSchema('worktree.unstage.request', WorktreeUnstageRequestPayloadSchema),
  createMessageEnvelopeSchema('worktree.discard.request', WorktreeDiscardRequestPayloadSchema),
  createMessageEnvelopeSchema(
    'operation.commit.create.request',
    OperationCommitCreateRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema('stash.list.request', StashListRequestPayloadSchema),
  createMessageEnvelopeSchema('stash.save.request', StashSaveRequestPayloadSchema),
  createMessageEnvelopeSchema('stash.pop.request', StashActionRequestPayloadSchema),
  createMessageEnvelopeSchema('stash.apply.request', StashActionRequestPayloadSchema),
  createMessageEnvelopeSchema('stash.drop.request', StashActionRequestPayloadSchema),
  createMessageEnvelopeSchema('search.request', SearchRequestPayloadSchema),
  createMessageEnvelopeSchema('graph.refresh.request', GraphRefreshRequestPayloadSchema),
  createMessageEnvelopeSchema('operation.checkout.request', OperationCheckoutRequestPayloadSchema),
  createMessageEnvelopeSchema(
    'operation.branch.create.request',
    OperationBranchCreateRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema(
    'operation.branch.rename.request',
    OperationBranchRenameRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema(
    'operation.branch.delete.request',
    OperationBranchDeleteRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema('operation.push.request', OperationPushRequestPayloadSchema),
  createMessageEnvelopeSchema(
    'operation.tag.create.request',
    OperationTagCreateRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema(
    'operation.tag.delete.request',
    OperationTagDeleteRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema('operation.merge.request', OperationMergeRequestPayloadSchema),
  createMessageEnvelopeSchema(
    'operation.merge.abort.request',
    OperationMergeAbortRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema('operation.rebase.request', OperationRebaseRequestPayloadSchema),
  createMessageEnvelopeSchema(
    'operation.rebase.continue.request',
    OperationRebaseActionRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema(
    'operation.rebase.abort.request',
    OperationRebaseActionRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema(
    'operation.rebase.skip.request',
    OperationRebaseActionRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema(
    'operation.cherryPick.request',
    OperationCherryPickRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema(
    'operation.cherryPick.continue.request',
    OperationSequencerActionRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema(
    'operation.cherryPick.abort.request',
    OperationSequencerActionRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema(
    'operation.cherryPick.skip.request',
    OperationSequencerActionRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema('operation.revert.request', OperationRevertRequestPayloadSchema),
  createMessageEnvelopeSchema(
    'operation.revert.continue.request',
    OperationSequencerActionRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema(
    'operation.revert.abort.request',
    OperationSequencerActionRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema(
    'operation.revert.skip.request',
    OperationSequencerActionRequestPayloadSchema,
  ),
  createMessageEnvelopeSchema('operation.reset.request', OperationResetRequestPayloadSchema),
  createMessageEnvelopeSchema('operation.fetch.request', OperationFetchRequestPayloadSchema),
  createMessageEnvelopeSchema('operation.cancel.request', OperationCancelRequestPayloadSchema),
  createMessageEnvelopeSchema('view.config.update', ViewConfigUpdatePayloadSchema),
]);

export const ExtensionToWebviewMessageSchema = z.discriminatedUnion('type', [
  createMessageEnvelopeSchema('app.bootstrap', AppBootstrapPayloadSchema),
  createMessageEnvelopeSchema('repositories.list.result', RepositoriesListResultPayloadSchema),
  createMessageEnvelopeSchema('repository.changed', RepositoryChangedPayloadSchema),
  createMessageEnvelopeSchema('commits.page.result', CommitsPageResultPayloadSchema),
  createMessageEnvelopeSchema('commit.details.result', CommitDetailsResultPayloadSchema),
  createMessageEnvelopeSchema('commit.diff.result', CommitDiffResultPayloadSchema),
  createMessageEnvelopeSchema('search.result', SearchResultPayloadSchema),
  createMessageEnvelopeSchema('worktree.status.result', WorktreeStatusResultPayloadSchema),
  createMessageEnvelopeSchema('stash.list.result', StashListResultPayloadSchema),
  createMessageEnvelopeSchema('graph.invalidated', GraphInvalidatedPayloadSchema),
  createMessageEnvelopeSchema('operation.progress', OperationProgressPayloadSchema),
  createMessageEnvelopeSchema('operation.result', OperationResultPayloadSchema),
  createMessageEnvelopeSchema('notification.error', NotificationErrorPayloadSchema),
  createMessageEnvelopeSchema('filter.path.set', FilterPathSetPayloadSchema),
]);

export const ProtocolMessageSchema = z.union([
  WebviewToExtensionMessageSchema,
  ExtensionToWebviewMessageSchema,
]);

// ---------------------------------------------------------------------------
// Safe Parsing Helpers
// ---------------------------------------------------------------------------

export type SafeParseResult<T> = { success: true; data: T } | { success: false; error: AppError };

function formatZodIssues(issues: z.ZodIssue[]): string {
  return issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
}

export function safeParseMessage<T>(schema: z.ZodType<T>, data: unknown): SafeParseResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const message = `Protocol validation failed: ${formatZodIssues(result.error.issues)}`;
  return {
    success: false,
    error: new AppError(AppErrorCode.INVALID_MESSAGE, message, {
      issues: result.error.issues,
      received: data,
    }),
  };
}

export function safeParseWebviewMessage(
  data: unknown,
): SafeParseResult<z.infer<typeof WebviewToExtensionMessageSchema>> {
  return safeParseMessage(WebviewToExtensionMessageSchema, data);
}

export function safeParseExtensionMessage(
  data: unknown,
): SafeParseResult<z.infer<typeof ExtensionToWebviewMessageSchema>> {
  return safeParseMessage(ExtensionToWebviewMessageSchema, data);
}
