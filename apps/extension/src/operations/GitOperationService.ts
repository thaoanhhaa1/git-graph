import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AppError,
  AppErrorCode,
  validateRebasePlan,
  type OperationCheckoutTargetType,
  type OperationMergeFastForwardMode,
  type OperationResetMode,
  type OperationProgressPayload,
  type OperationResultPayload,
  type OperationPullStrategy,
  type OperationUndoInfo,
  type RebasePlanEntry,
  type ReflogEntry,
  type RepositorySyncStatus,
  type TagType,
} from '@git-graph/shared';
import {
  GitCommandError,
  RebasePlanQuery,
  type GitRepository,
  type GitResult,
} from '@git-graph/git-core';
import type { RepositoryManager } from '../repositories/RepositoryManager';
import type { RefreshCoordinator } from '../application/RefreshCoordinator';
import { OperationQueue } from './OperationQueue';
import { OperationPreflight, type PreflightRequirements } from './OperationPreflight';
import { t } from '../i18n/l10n';
import {
  type OperationCommandMetadata,
  type OperationExecutionResult,
  createOperationSuccessResult,
  createOperationFailureResult,
  sanitizeGitCommandMetadata,
} from './OperationResult';

export interface OperationContext {
  operationId: string;
  repositoryId: string;
  repository: GitRepository;
  signal: AbortSignal;
  reportProgress: (progress: number, message?: string) => void;
  logCommand: (
    executable: string,
    args: readonly string[],
    durationMs?: number,
  ) => OperationCommandMetadata;
}

export interface RunOperationOptions<T = unknown> {
  operationId?: string;
  repositoryId: string;
  type: string;
  preflight?: PreflightRequirements;
  execute: (context: OperationContext) => Promise<T>;
  undoLabel?: string;
}

export interface GitOperationServiceOptions {
  repositoryManager: RepositoryManager;
  refreshCoordinator: RefreshCoordinator;
  queue?: OperationQueue;
  preflight?: OperationPreflight;
  logger?: (message: string) => void;
}

export interface CheckoutOperationOptions {
  operationId?: string;
  repositoryId: string;
  target: string;
  targetType: OperationCheckoutTargetType;
  localBranchName?: string;
  confirmedDetachedHead?: boolean;
  confirmedRemoteTracking?: boolean;
}

export interface CheckoutOperationData {
  target: string;
  targetType: OperationCheckoutTargetType;
  checkedOutRef: string;
  detachedHead: boolean;
  localBranchName?: string;
  upstream?: string;
  warning?: string;
}

export interface CreateBranchOperationOptions {
  operationId?: string;
  repositoryId: string;
  name: string;
  startPoint?: string;
  checkout?: boolean;
}

export interface CreateBranchOperationData {
  name: string;
  branchRef: string;
  startPoint: string;
  commitSha: string;
  checkedOut: boolean;
}

export interface RenameBranchOperationOptions {
  operationId?: string;
  repositoryId: string;
  oldName: string;
  newName: string;
  syncRemote?: boolean;
  remote?: string;
}

export interface RenameBranchOperationData {
  oldName: string;
  newName: string;
  branchRef: string;
  remoteSynced?: boolean;
  remote?: string;
}

export interface DeleteBranchOperationOptions {
  operationId?: string;
  repositoryId: string;
  branchName: string;
  forceDelete?: boolean;
  deleteOnRemote?: boolean;
  remote?: string;
}

export interface DeleteBranchOperationData {
  branchName: string;
  forceDelete?: boolean;
  deletedLocal?: boolean;
  deletedRemote?: boolean;
  remote?: string;
}

export interface PushBranchOperationOptions {
  operationId?: string;
  repositoryId: string;
  branchName?: string;
  remote?: string;
  setUpstream?: boolean;
  force?: boolean;
  forceWithLease?: boolean;
  tags?: boolean;
}

export interface PushBranchOperationData {
  branchName: string;
  remote: string;
}

export interface CreateTagOperationOptions {
  operationId?: string;
  repositoryId: string;
  name: string;
  target?: string;
  tagType?: TagType;
  message?: string;
  pushToRemote?: boolean;
  remote?: string;
}

export interface CreateTagOperationData {
  name: string;
  tagRef: string;
  target: string;
  commitSha: string;
  tagType: TagType;
  message?: string;
  pushedToRemote?: boolean;
  remote?: string;
}

export interface DeleteTagOperationOptions {
  operationId?: string;
  repositoryId: string;
  tagName: string;
  deleteOnRemote?: boolean;
  remote?: string;
}

export interface DeleteTagOperationData {
  tagName: string;
  deletedLocal: boolean;
  deletedRemote?: boolean;
  remote?: string;
}

export interface MergeOperationOptions {
  operationId?: string;
  repositoryId: string;
  target: string;
  fastForwardMode?: OperationMergeFastForwardMode;
  squash?: boolean;
  noCommit?: boolean;
  exclusive?: boolean;
  targetBranch?: string;
}

export interface MergeOperationData {
  target: string;
  targetCommitSha: string;
  currentBranch: string;
  fastForwardMode?: OperationMergeFastForwardMode;
  squash?: boolean;
  noCommit?: boolean;
  exclusive?: boolean;
  squashedCommits?: string[];
  mergeState: MergeState;
}

export interface MergeAbortOperationOptions {
  operationId?: string;
  repositoryId: string;
}

export interface MergeAbortOperationData {
  aborted: true;
  mergeStateBeforeAbort: MergeState;
}

export interface MergeState {
  inProgress: boolean;
  headSha?: string;
  targetSha?: string;
  unmergedFiles: string[];
}

export interface RebaseOperationOptions {
  operationId?: string;
  repositoryId: string;
  target: string;
  confirmedPublishedBranch?: boolean;
  ignoreDate?: boolean;
}

export interface RebaseOperationData {
  target: string;
  targetCommitSha: string;
  currentBranch: string;
  upstream?: string;
  ignoreDate?: boolean;
  rebaseState: RebaseState;
}

export interface RebaseActionOperationOptions {
  operationId?: string;
  repositoryId: string;
}

export interface RebaseActionOperationData {
  action: 'continue' | 'abort' | 'skip';
  rebaseStateBeforeAction: RebaseState;
  rebaseState: RebaseState;
}

export interface InteractiveRebaseOperationOptions {
  operationId?: string;
  repositoryId: string;
  onto: string;
  plan: RebasePlanEntry[];
  confirmedPublishedBranch?: boolean;
}

export interface InteractiveRebaseOperationData {
  onto: string;
  ontoSha: string;
  currentBranch: string;
  upstream?: string;
  plan: RebasePlanEntry[];
  rebaseState: RebaseState;
}

export interface RebaseState {
  inProgress: boolean;
  headSha?: string;
  originalHeadSha?: string;
  ontoSha?: string;
  currentPatchSha?: string;
  completedSteps?: number;
  totalSteps?: number;
  unmergedFiles: string[];
}

interface InteractiveRebaseSession {
  tempDir: string;
  sequenceEditorPath: string;
  messageEditorPath: string;
}

export interface CherryPickOperationOptions {
  operationId?: string;
  repositoryId: string;
  commit: string;
  mainlineParent?: number;
  noCommit?: boolean;
}

export interface CherryPickOperationData {
  commit: string;
  commitSha: string;
  mainlineParent?: number;
  noCommit?: boolean;
  operationState: SequencerOperationState;
}

export interface RevertOperationOptions {
  operationId?: string;
  repositoryId: string;
  commit: string;
  mainlineParent?: number;
}

export interface RevertOperationData {
  commit: string;
  commitSha: string;
  mainlineParent?: number;
  operationState: SequencerOperationState;
}

export interface SequencerActionOperationOptions {
  operationId?: string;
  repositoryId: string;
}

export interface SequencerActionOperationData {
  operation: 'cherry-pick' | 'revert';
  action: 'continue' | 'abort' | 'skip';
  operationStateBeforeAction: SequencerOperationState;
  operationState: SequencerOperationState;
}

export interface SequencerOperationState {
  inProgress: boolean;
  operation?: 'cherry-pick' | 'revert';
  headSha?: string;
  targetSha?: string;
  unmergedFiles: string[];
}

export interface ResetOperationOptions {
  operationId?: string;
  repositoryId: string;
  target: string;
  mode: OperationResetMode;
  confirmedHardReset?: boolean;
}

export interface ResetOperationData {
  target: string;
  targetCommitSha: string;
  mode: OperationResetMode;
}

export interface FetchOperationOptions {
  operationId?: string;
  repositoryId: string;
  remote?: string;
  prune?: boolean;
  all?: boolean;
}

export interface FetchOperationData {
  remote: string;
  pruned: boolean;
}

export interface PullOperationOptions {
  operationId?: string;
  repositoryId: string;
  remote?: string;
  branch?: string;
  strategy?: OperationPullStrategy;
  autostash?: boolean;
}

export interface PullOperationData {
  remote?: string;
  branch?: string;
  strategy: OperationPullStrategy;
  autostashed: boolean;
}

export interface AddRemoteOperationOptions {
  operationId?: string;
  repositoryId: string;
  name: string;
  url: string;
}

export interface RemoveRemoteOperationOptions {
  operationId?: string;
  repositoryId: string;
  name: string;
}

export interface RenameRemoteOperationOptions {
  operationId?: string;
  repositoryId: string;
  oldName: string;
  newName: string;
}

export interface SetRemoteUrlOperationOptions {
  operationId?: string;
  repositoryId: string;
  name: string;
  url: string;
  push?: boolean;
}

export interface RemoteOperationData {
  name: string;
}

export interface UndoOperationOptions {
  operationId?: string;
  repositoryId: string;
  reflogIndex?: number;
  expectedSha?: string;
}

export interface UndoOperationData {
  targetSha: string;
  reflogIndex: number;
  previousHeadSha?: string;
}

interface UndoHistoryEntry {
  operationId: string;
  repositoryId: string;
  type: string;
  preHeadSha: string;
  postHeadSha: string;
  reflogIndex: number;
  label: string;
}

const UNDOABLE_OPERATION_TYPES = new Set([
  'reset',
  'merge',
  'rebase',
  'cherry-pick',
  'revert',
  'commit-create',
]);

const UNDO_LABELS: Record<string, string> = {
  reset: 'reset',
  merge: 'merge',
  rebase: 'rebase',
  'cherry-pick': 'cherry-pick',
  revert: 'revert',
  'commit-create': 'commit',
};

const UNDO_UNAVAILABLE_REASONS: Record<string, string> = {
  'branch-push': 'Undo is not available after pushing to a remote.',
  'branch-delete': 'Undo is not available after deleting a branch.',
  'tag-delete': 'Undo is not available after deleting a tag.',
};

const MAX_UNDO_HISTORY = 20;

export interface StageWorktreeOperationOptions {
  operationId?: string;
  repositoryId: string;
  paths: string[];
  all?: boolean;
}

export interface StageWorktreeOperationData {
  paths: string[];
  all: boolean;
}

export interface DiscardWorktreeOperationOptions {
  operationId?: string;
  repositoryId: string;
  paths: string[];
  all?: boolean;
  untracked?: boolean;
}

export interface DiscardWorktreeOperationData {
  paths: string[];
  all: boolean;
}

export interface AddGitWorktreeOperationOptions {
  operationId?: string;
  repositoryId: string;
  path: string;
  branch?: string;
  newBranch?: string;
}

export interface AddGitWorktreeOperationData {
  path: string;
  branch?: string;
  newBranch?: string;
}

export interface RemoveGitWorktreeOperationOptions {
  operationId?: string;
  repositoryId: string;
  path: string;
  force?: boolean;
}

export interface RemoveGitWorktreeOperationData {
  path: string;
  force: boolean;
}

export interface CreateCommitOperationOptions {
  operationId?: string;
  repositoryId: string;
  message: string;
  description?: string;
  amend?: boolean;
}

export interface CreateCommitOperationData {
  sha: string;
  subject: string;
  amended: boolean;
}

export interface SaveStashOperationOptions {
  operationId?: string;
  repositoryId: string;
  message?: string;
  includeUntracked?: boolean;
  keepIndex?: boolean;
}

export interface SaveStashOperationData {
  message?: string;
  includeUntracked: boolean;
  keepIndex: boolean;
}

export interface StashActionOperationOptions {
  operationId?: string;
  repositoryId: string;
  index: number;
}

export interface StashActionOperationData {
  action: 'pop' | 'apply' | 'drop';
  index: number;
  ref: string;
}

const DETACHED_HEAD_WARNING =
  'Checking out this target will detach HEAD. Commits created in detached HEAD can be lost unless you create a branch first.';

const REMOTE_TRACKING_WARNING =
  'Checking out a remote branch creates a new local branch that tracks the selected remote branch.';

/**
 * Unified service coordinating all mutating Git operations.
 * Enforces per-repository serialization, preflight checks, sanitized logging,
 * progress updates, cancellation, cache invalidation, and actionable error reporting.
 */
export class GitOperationService implements vscode.Disposable {
  private readonly _repositoryManager: RepositoryManager;
  private readonly _refreshCoordinator: RefreshCoordinator;
  private readonly _queue: OperationQueue;
  private readonly _preflight: OperationPreflight;
  private readonly _logger?: (message: string) => void;

  private readonly _onDidProgress = new vscode.EventEmitter<OperationProgressPayload>();
  public readonly onDidProgress: vscode.Event<OperationProgressPayload> = this._onDidProgress.event;

  private readonly _onDidResult = new vscode.EventEmitter<OperationResultPayload>();
  public readonly onDidResult: vscode.Event<OperationResultPayload> = this._onDidResult.event;

  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _undoHistory: UndoHistoryEntry[] = [];
  private readonly _interactiveRebaseSessions = new Map<string, InteractiveRebaseSession>();

  public constructor(options: GitOperationServiceOptions) {
    this._repositoryManager = options.repositoryManager;
    this._refreshCoordinator = options.refreshCoordinator;
    this._queue = options.queue ?? new OperationQueue();
    this._preflight = options.preflight ?? new OperationPreflight();
    this._logger = options.logger;

    this._disposables.push(this._queue);
    this._disposables.push(this._onDidProgress);
    this._disposables.push(this._onDidResult);
  }

  public get queue(): OperationQueue {
    return this._queue;
  }

  public get preflight(): OperationPreflight {
    return this._preflight;
  }

  /**
   * Reports progress with the operation ID.
   */
  private _reportProgress(requestId: string, progress: number, message?: string): void {
    const clampedProgress = Math.max(0, Math.min(1, progress));
    this._onDidProgress.fire({
      requestId,
      progress: clampedProgress,
      message,
    });
  }

  /**
   * Fires the operation result event.
   */
  private _emitResult(result: OperationExecutionResult): void {
    this._onDidResult.fire({
      requestId: result.operationId,
      success: result.success,
      error: result.error,
      data: result.data,
      ...(result.undo ? { undo: result.undo } : {}),
    });
  }

  /**
   * Safely logs command metadata without secrets.
   */
  private _log(message: string): void {
    if (this._logger) {
      this._logger(message);
    }
  }

  /**
   * Executes a mutating Git operation safely within the operation framework.
   */
  public async runOperation<T>(
    options: RunOperationOptions<T>,
  ): Promise<OperationExecutionResult<T>> {
    const operationId =
      options.operationId ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

    const repository = this._repositoryManager.getRepository(options.repositoryId);
    if (!repository) {
      const notRepoError = new AppError(
        AppErrorCode.NOT_A_REPOSITORY,
        `Repository '${options.repositoryId}' not found.`,
      );
      const failureResult = createOperationFailureResult(
        operationId,
        options.repositoryId,
        notRepoError,
      );
      this._reportProgress(operationId, 1.0, 'Repository not found.');
      this._emitResult(failureResult);
      return failureResult as OperationExecutionResult<T>;
    }

    return this._queue.enqueue(
      options.repositoryId,
      operationId,
      options.type,
      async (signal: AbortSignal) => {
        const startTime = Date.now();
        let lastCommandMetadata: OperationCommandMetadata | undefined;

        this._reportProgress(operationId, 0.05, `Starting ${options.type}...`);

        // 1. Run preflight checks if specified
        if (options.preflight) {
          this._reportProgress(operationId, 0.15, 'Validating repository state...');
          const preflightRes = await this._preflight.run(repository, options.preflight);

          if (!preflightRes.passed) {
            const durationMs = Date.now() - startTime;
            const err =
              preflightRes.error ||
              new AppError(AppErrorCode.GIT_COMMAND_FAILED, 'Preflight check failed.');
            const failureResult = createOperationFailureResult(
              operationId,
              options.repositoryId,
              err,
              undefined,
              durationMs,
            );
            this._reportProgress(operationId, 1.0, failureResult.actionableMessage);
            this._emitResult(failureResult);
            return failureResult as OperationExecutionResult<T>;
          }
        }

        // 2. Check for early abort
        if (signal.aborted) {
          const durationMs = Date.now() - startTime;
          const cancelError = new AppError(
            AppErrorCode.OPERATION_CANCELLED,
            'Operation was cancelled.',
          );
          const failureResult = createOperationFailureResult(
            operationId,
            options.repositoryId,
            cancelError,
            undefined,
            durationMs,
          );
          this._reportProgress(operationId, 1.0, 'Operation was cancelled.');
          this._emitResult(failureResult);
          return failureResult as OperationExecutionResult<T>;
        }

        // 3. Prepare execution context
        const logCommand = (
          executable: string,
          args: readonly string[],
          cmdDurationMs?: number,
        ): OperationCommandMetadata => {
          const meta = sanitizeGitCommandMetadata(executable, args, cmdDurationMs);
          lastCommandMetadata = meta;
          this._log(`[${options.repositoryId}] ${meta.command}`);
          return meta;
        };

        const context: OperationContext = {
          operationId,
          repositoryId: options.repositoryId,
          repository,
          signal,
          reportProgress: (progress, message) =>
            this._reportProgress(operationId, progress, message),
          logCommand,
        };

        const isUndoable = UNDOABLE_OPERATION_TYPES.has(options.type);
        const preHeadSha = isUndoable ? await this._readHeadSha(repository, signal) : undefined;

        this._reportProgress(operationId, 0.35, `Executing ${options.type}...`);

        this._refreshCoordinator.mute(options.repositoryId);
        try {
          const data = await options.execute(context);
          const durationMs = Date.now() - startTime;
          let undo: OperationUndoInfo | undefined;

          if (isUndoable) {
            const postHeadSha = await this._readHeadSha(repository, signal);
            if (preHeadSha && postHeadSha && preHeadSha !== postHeadSha) {
              const entry: UndoHistoryEntry = {
                operationId,
                repositoryId: options.repositoryId,
                type: options.type,
                preHeadSha,
                postHeadSha,
                reflogIndex: 1,
                label: options.undoLabel ?? UNDO_LABELS[options.type] ?? options.type,
              };
              this._undoHistory.push(entry);
              if (this._undoHistory.length > MAX_UNDO_HISTORY) {
                this._undoHistory.shift();
              }
              undo = {
                available: true,
                label: entry.label,
                reflogIndex: entry.reflogIndex,
                expectedSha: entry.preHeadSha,
              };
            } else {
              undo = {
                available: false,
                reason: 'This operation did not change HEAD.',
              };
            }
          } else if (UNDO_UNAVAILABLE_REASONS[options.type]) {
            undo = {
              available: false,
              reason: UNDO_UNAVAILABLE_REASONS[options.type],
            };
          }

          try {
            await this._repositoryManager.refresh();
          } catch {
            this._log(
              `[${options.repositoryId}] Repository metadata refresh failed after ${options.type}.`,
            );
          }

          this._refreshCoordinator.unmute(options.repositoryId);
          this._refreshCoordinator.invalidate(options.repositoryId, `operation-${options.type}`);

          this._reportProgress(operationId, 1.0, 'Completed successfully.');
          const successResult = createOperationSuccessResult<T>(
            operationId,
            options.repositoryId,
            data,
            lastCommandMetadata,
            durationMs,
            undo,
          );
          this._emitResult(successResult);
          return successResult;
        } catch (err: unknown) {
          this._refreshCoordinator.unmute(options.repositoryId);
          const durationMs = Date.now() - startTime;
          const failureResult = createOperationFailureResult(
            operationId,
            options.repositoryId,
            err,
            lastCommandMetadata,
            durationMs,
          );

          this._reportProgress(
            operationId,
            1.0,
            failureResult.actionableMessage || 'Operation failed.',
          );
          this._emitResult(failureResult);
          return failureResult as OperationExecutionResult<T>;
        }
      },
    );
  }

  public checkout(
    options: CheckoutOperationOptions,
  ): Promise<OperationExecutionResult<CheckoutOperationData>> {
    const target = options.target.trim();
    const localBranchName = options.localBranchName?.trim();
    const preflight: PreflightRequirements = {
      requireCleanWorktree: true,
      disallowBare: true,
      allowDetachedHead: true,
    };

    if (options.targetType === 'localBranch') {
      const branchName = this._normalizeLocalBranchName(target);
      preflight.validateBranchName = branchName;
      preflight.checkBranchMustExist = branchName;
    } else if (options.targetType === 'remoteBranch' && localBranchName) {
      preflight.validateBranchName = localBranchName;
    }

    return this.runOperation<CheckoutOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'checkout',
      preflight,
      execute: async (context) => {
        switch (options.targetType) {
          case 'localBranch':
            return this._checkoutLocalBranch(context, target);
          case 'remoteBranch':
            return this._checkoutRemoteBranch(context, target, localBranchName, options);
          case 'tag':
            return this._checkoutDetachedTarget(context, target, 'tag', options);
          case 'commit':
            return this._checkoutDetachedTarget(context, target, 'commit', options);
          default:
            throw new AppError(
              AppErrorCode.GIT_COMMAND_FAILED,
              'Unsupported checkout target type.',
            );
        }
      },
    });
  }

  public createBranch(
    options: CreateBranchOperationOptions,
  ): Promise<OperationExecutionResult<CreateBranchOperationData>> {
    const name = options.name.trim();
    const startPoint = options.startPoint?.trim() || 'HEAD';
    const checkout = options.checkout ?? false;

    return this.runOperation<CreateBranchOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'branch-create',
      preflight: {
        requireCleanWorktree: checkout,
        disallowBare: true,
        allowDetachedHead: true,
        validateBranchName: name,
        checkBranchMustNotExist: name,
      },
      execute: async (context) => {
        const commitSha = await this._resolveStartPoint(
          context.repository,
          startPoint,
          context.signal,
        );
        const args = checkout
          ? ['checkout', '-b', name, commitSha, '--']
          : ['branch', '--', name, commitSha];

        context.reportProgress(
          0.65,
          checkout
            ? `Creating and checking out branch '${name}'...`
            : `Creating branch '${name}'...`,
        );
        await this._execGit(context, args);

        return {
          name,
          branchRef: `refs/heads/${name}`,
          startPoint,
          commitSha,
          checkedOut: checkout,
        };
      },
    });
  }

  public renameBranch(
    options: RenameBranchOperationOptions,
  ): Promise<OperationExecutionResult<RenameBranchOperationData>> {
    const rawOld = options.oldName.trim();
    const rawNew = options.newName.trim();

    let remote = options.remote?.trim() || 'origin';
    let oldBranchName = rawOld.replace(/^refs\/heads\//, '');
    let isRemote = false;

    if (oldBranchName.startsWith('refs/remotes/')) {
      const withoutPrefix = oldBranchName.slice('refs/remotes/'.length);
      const slashIdx = withoutPrefix.indexOf('/');
      if (slashIdx > 0) {
        remote = withoutPrefix.slice(0, slashIdx);
        oldBranchName = withoutPrefix.slice(slashIdx + 1);
      } else {
        oldBranchName = withoutPrefix;
      }
      isRemote = true;
    } else if (oldBranchName.startsWith('origin/')) {
      remote = 'origin';
      oldBranchName = oldBranchName.slice('origin/'.length);
      isRemote = true;
    }

    let newBranchName = rawNew.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\//, '');
    if (newBranchName.startsWith(`${remote}/`)) {
      newBranchName = newBranchName.slice(remote.length + 1);
    }

    const syncRemote = options.syncRemote ?? isRemote;

    return this.runOperation<RenameBranchOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'branch-rename',
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
        validateBranchName: newBranchName,
        checkBranchMustNotExist: newBranchName,
      },
      execute: async (context) => {
        const localExists = await this._preflight.branchExists(context.repository, oldBranchName);

        if (localExists) {
          context.reportProgress(
            0.4,
            `Renaming local branch '${oldBranchName}' to '${newBranchName}'...`,
          );
          await this._execGit(context, ['branch', '-m', oldBranchName, newBranchName]);
        } else {
          let remoteRefExists = false;
          try {
            const check = await context.repository.exec([
              'show-ref',
              '--verify',
              '--quiet',
              `refs/remotes/${remote}/${oldBranchName}`,
            ]);
            remoteRefExists = check.exitCode === 0;
          } catch {
            remoteRefExists = false;
          }

          if (!remoteRefExists) {
            throw new AppError(
              AppErrorCode.GIT_COMMAND_FAILED,
              `Branch '${oldBranchName}' does not exist in the repository.`,
            );
          }

          context.reportProgress(
            0.4,
            `Creating local branch '${newBranchName}' from '${remote}/${oldBranchName}'...`,
          );
          await this._execGit(context, ['branch', newBranchName, `${remote}/${oldBranchName}`]);
        }

        if (syncRemote) {
          context.reportProgress(0.65, `Pushing '${newBranchName}' to remote '${remote}'...`);
          await this._execGit(context, ['push', '-u', remote, newBranchName]);

          context.reportProgress(
            0.85,
            `Deleting old branch '${oldBranchName}' from remote '${remote}'...`,
          );
          try {
            await this._execGit(context, ['push', remote, '--delete', oldBranchName]);
          } catch {
            // If old branch did not exist on remote, ignore delete failure
          }

          try {
            await this._execGit(context, ['fetch', remote, '--prune']);
          } catch {
            // Ignore fetch prune failure if offline
          }
        }

        return {
          oldName: oldBranchName,
          newName: newBranchName,
          branchRef: `refs/heads/${newBranchName}`,
          remoteSynced: syncRemote,
          remote: syncRemote ? remote : undefined,
        };
      },
    });
  }

  public deleteBranch(
    options: DeleteBranchOperationOptions,
  ): Promise<OperationExecutionResult<DeleteBranchOperationData>> {
    const raw = options.branchName.trim();
    let remote = options.remote?.trim() || 'origin';
    let branchName = raw.replace(/^refs\/heads\//, '');
    let isRemote = false;

    if (branchName.startsWith('refs/remotes/')) {
      const withoutPrefix = branchName.slice('refs/remotes/'.length);
      const slashIdx = withoutPrefix.indexOf('/');
      if (slashIdx > 0) {
        remote = withoutPrefix.slice(0, slashIdx);
        branchName = withoutPrefix.slice(slashIdx + 1);
      } else {
        branchName = withoutPrefix;
      }
      isRemote = true;
    } else if (branchName.startsWith('origin/')) {
      remote = 'origin';
      branchName = branchName.slice('origin/'.length);
      isRemote = true;
    }

    const forceDelete = Boolean(options.forceDelete);
    const deleteOnRemote = options.deleteOnRemote ?? isRemote;

    return this.runOperation<DeleteBranchOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'branch-delete',
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        let deletedLocal = false;
        let deletedRemote = false;

        const localExists = await this._preflight.branchExists(context.repository, branchName);

        if (localExists) {
          // Check if current HEAD is on this branch
          try {
            const headCheck = await context.repository.exec(['symbolic-ref', '--short', 'HEAD']);
            if (headCheck.exitCode === 0 && headCheck.stdout.trim() === branchName) {
              throw new AppError(
                AppErrorCode.GIT_COMMAND_FAILED,
                `Cannot delete branch '${branchName}' because it is currently checked out. Please switch to another branch first.`,
              );
            }
          } catch (e) {
            if (e instanceof AppError) {
              throw e;
            }
          }

          context.reportProgress(0.3, `Deleting local branch '${branchName}'...`);
          try {
            await this._execGit(context, ['branch', forceDelete ? '-D' : '-d', branchName]);
            deletedLocal = true;
          } catch (err: unknown) {
            if (!forceDelete) {
              throw new AppError(
                AppErrorCode.GIT_COMMAND_FAILED,
                `The branch '${branchName}' is not fully merged. Check "Force Delete" to delete it anyway.`,
              );
            }
            throw err;
          }
        }

        if (deleteOnRemote) {
          context.reportProgress(
            0.65,
            `Deleting branch '${branchName}' from remote '${remote}'...`,
          );
          try {
            await this._execGit(context, ['push', remote, '--delete', branchName]);
            deletedRemote = true;
          } catch (err: unknown) {
            // If local was also not deleted and remote failed, throw error
            if (!deletedLocal && !localExists) {
              throw err;
            }
          }

          try {
            await this._execGit(context, ['fetch', remote, '--prune']);
          } catch {
            // Ignore fetch prune failure if offline
          }
        }

        if (!localExists && !deleteOnRemote) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            `Branch '${branchName}' does not exist locally.`,
          );
        }

        return {
          branchName,
          forceDelete,
          deletedLocal,
          deletedRemote,
          remote: deleteOnRemote ? remote : undefined,
        };
      },
    });
  }

  public pushBranch(
    options: PushBranchOperationOptions,
  ): Promise<OperationExecutionResult<PushBranchOperationData>> {
    const remote = options.remote?.trim() || 'origin';

    return this.runOperation<PushBranchOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'branch-push',
      preflight: {
        disallowBare: true,
        allowDetachedHead: false,
      },
      execute: async (context) => {
        let branch = options.branchName?.trim();
        if (!branch) {
          const head = await this._preflight.checkHead(context.repository);
          if (!head.currentBranch) {
            throw new AppError(
              AppErrorCode.GIT_COMMAND_FAILED,
              'Push requires a checked-out branch.',
            );
          }
          branch = head.currentBranch;
        }

        const args = ['push'];
        if (options.setUpstream) {
          args.push('-u');
        }
        if (options.forceWithLease ?? options.force) {
          args.push('--force-with-lease');
        }
        if (options.tags) {
          args.push('--tags');
        }
        args.push(remote, branch);

        context.reportProgress(0.5, `Pushing branch '${branch}' to remote '${remote}'...`);
        await this._execGit(context, args);

        return {
          branchName: branch,
          remote,
        };
      },
    });
  }

  public createTag(
    options: CreateTagOperationOptions,
  ): Promise<OperationExecutionResult<CreateTagOperationData>> {
    const name = options.name.trim();
    const target = options.target?.trim() || 'HEAD';
    const tagType = options.tagType ?? 'lightweight';
    const message = options.message?.trim() || undefined;
    const pushToRemote = Boolean(options.pushToRemote);
    const remote = options.remote?.trim() || 'origin';

    return this.runOperation<CreateTagOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'tag-create',
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
        validateTagName: name,
        checkTagMustNotExist: name,
      },
      execute: async (context) => {
        if (tagType === 'annotated' && !message) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            'An annotated tag requires a message. Enter a tag message or create a lightweight tag instead.',
          );
        }

        const commitSha = await this._resolveTagCreationTarget(
          context.repository,
          target,
          context.signal,
        );

        context.reportProgress(
          0.65,
          tagType === 'annotated'
            ? `Creating annotated tag '${name}'...`
            : `Creating tag '${name}'...`,
        );

        if (tagType === 'annotated' && message) {
          await this._execGit(context, ['tag', '-a', '-m', message, '--', name, commitSha]);
        } else {
          await this._execGit(context, ['tag', '--', name, commitSha]);
        }

        let pushedToRemote = false;
        if (pushToRemote) {
          context.reportProgress(0.8, `Pushing tag '${name}' to remote '${remote}'...`);
          await this._execGit(context, ['push', remote, `refs/tags/${name}`]);
          pushedToRemote = true;
        }

        return {
          name,
          tagRef: `refs/tags/${name}`,
          target,
          commitSha,
          tagType,
          ...(message ? { message } : {}),
          ...(pushedToRemote ? { pushedToRemote, remote } : {}),
        };
      },
    });
  }

  public deleteTag(
    options: DeleteTagOperationOptions,
  ): Promise<OperationExecutionResult<DeleteTagOperationData>> {
    const tagName = options.tagName.trim().replace(/^refs\/tags\//, '');
    const deleteOnRemote = Boolean(options.deleteOnRemote);
    const remote = options.remote?.trim() || 'origin';

    return this.runOperation<DeleteTagOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'tag-delete',
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
        validateTagName: tagName,
      },
      execute: async (context) => {
        const exists = await this._preflight.tagExists(context.repository, tagName);
        if (!exists) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            `Tag '${tagName}' does not exist in the repository.`,
          );
        }

        context.reportProgress(0.4, `Deleting local tag '${tagName}'...`);
        await this._execGit(context, ['tag', '--delete', '--', tagName]);

        let deletedRemote = false;
        if (deleteOnRemote) {
          context.reportProgress(0.7, `Deleting tag '${tagName}' from remote '${remote}'...`);
          await this._execGit(context, ['push', remote, '--delete', `refs/tags/${tagName}`]);
          deletedRemote = true;
        }

        return {
          tagName,
          deletedLocal: true,
          ...(deletedRemote ? { deletedRemote, remote } : {}),
        };
      },
    });
  }

  public merge(
    options: MergeOperationOptions,
  ): Promise<OperationExecutionResult<MergeOperationData>> {
    const target = options.target.trim();
    const fastForwardMode = options.fastForwardMode ?? 'ff';
    const squash = Boolean(options.squash);
    const noCommit = Boolean(options.noCommit);

    return this.runOperation<MergeOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'merge',
      preflight: {
        requireCleanWorktree: true,
        disallowBare: true,
        allowDetachedHead: false,
      },
      execute: async (context) => {
        const head = await this._preflight.checkHead(context.repository);
        if (!head.currentBranch) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            'Merge requires a checked-out current branch.',
          );
        }

        const targetCommitSha = await this._resolveMergeTarget(
          context.repository,
          target,
          context.signal,
        );

        if (squash && options.exclusive) {
          context.reportProgress(
            0.65,
            `Squash merging exclusive commits of '${options.targetBranch || target}' into '${head.currentBranch}'...`,
          );

          let commitsToSquash: string[] = [];
          if (options.targetBranch) {
            commitsToSquash = await this._resolveExclusiveBranchCommits(
              context.repository,
              options.targetBranch,
              head.currentBranch,
              context.signal,
            );
          } else {
            commitsToSquash = [targetCommitSha];
          }

          if (commitsToSquash.length === 0) {
            commitsToSquash = [targetCommitSha];
          }

          try {
            for (const commitSha of commitsToSquash) {
              const parentCount = await this._readParentCount(
                context.repository,
                commitSha,
                context.signal,
              );
              const args = ['cherry-pick', '-n'];
              if (parentCount > 1) {
                args.push('-m', '1');
              }
              args.push('--end-of-options', commitSha);
              await this._execGit(context, args);
            }
          } catch (error: unknown) {
            const unmergedFiles = await this._readUnmergedFiles(context.repository, context.signal);
            if (unmergedFiles.length > 0) {
              const mergeState: MergeState = {
                inProgress: true,
                headSha: head.currentBranch,
                targetSha: targetCommitSha,
                unmergedFiles,
              };
              throw new AppError(
                AppErrorCode.GIT_COMMAND_FAILED,
                `Merge stopped with conflicts in ${unmergedFiles.length} file(s). Resolve conflicts and continue in Git, or abort the merge.`,
                { mergeState, target, currentBranch: head.currentBranch },
              );
            }
            throw error;
          }

          return {
            target,
            targetCommitSha,
            currentBranch: head.currentBranch,
            squash: true,
            exclusive: true,
            squashedCommits: commitsToSquash,
            mergeState: await this._readMergeState(context.repository, context.signal),
          };
        }

        let args: string[];
        if (squash) {
          args = ['merge', '--squash', '--end-of-options', targetCommitSha];
          context.reportProgress(
            0.65,
            `Squash merging '${target}' into '${head.currentBranch}'...`,
          );
        } else {
          const modeArg =
            fastForwardMode === 'no-ff'
              ? '--no-ff'
              : fastForwardMode === 'ff-only'
                ? '--ff-only'
                : '--ff';
          args = ['merge', modeArg];
          if (!noCommit) {
            args.push('--no-edit');
          }
          if (noCommit) {
            args.push('--no-commit');
          }
          args.push('--end-of-options', targetCommitSha);
          context.reportProgress(
            0.65,
            `Merging '${target}' into '${head.currentBranch}'${fastForwardMode === 'no-ff' ? ' with --no-ff' : ''}${noCommit ? ' without committing' : ''}...`,
          );
        }

        try {
          await this._execGit(context, args);
        } catch (error: unknown) {
          const mergeState = await this._readMergeState(context.repository, context.signal);
          if (mergeState.inProgress) {
            throw new AppError(
              AppErrorCode.GIT_COMMAND_FAILED,
              `Merge stopped with conflicts in ${mergeState.unmergedFiles.length} file(s). Resolve conflicts and continue in Git, or abort the merge.`,
              { mergeState, target, currentBranch: head.currentBranch },
            );
          }
          throw error;
        }

        return {
          target,
          targetCommitSha,
          currentBranch: head.currentBranch,
          fastForwardMode: squash ? undefined : fastForwardMode,
          squash,
          ...(noCommit ? { noCommit: true } : {}),
          mergeState: await this._readMergeState(context.repository, context.signal),
        };
      },
    });
  }

  public abortMerge(
    options: MergeAbortOperationOptions,
  ): Promise<OperationExecutionResult<MergeAbortOperationData>> {
    return this.runOperation<MergeAbortOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'merge-abort',
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        const mergeStateBeforeAbort = await this._readMergeState(
          context.repository,
          context.signal,
        );
        if (!mergeStateBeforeAbort.inProgress) {
          throw new AppError(AppErrorCode.GIT_COMMAND_FAILED, 'No merge is currently in progress.');
        }

        try {
          await this._execGit(context, ['merge', '--abort']);
        } catch {
          await this._execGit(context, ['reset', '--merge']);
        }

        return {
          aborted: true,
          mergeStateBeforeAbort,
        };
      },
    });
  }

  public rebase(
    options: RebaseOperationOptions,
  ): Promise<OperationExecutionResult<RebaseOperationData>> {
    const target = options.target.trim();

    return this.runOperation<RebaseOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'rebase',
      preflight: {
        requireCleanWorktree: true,
        disallowBare: true,
        allowDetachedHead: false,
      },
      execute: async (context) => {
        const head = await this._preflight.checkHead(context.repository);
        if (!head.currentBranch) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            'Rebase requires a checked-out current branch.',
          );
        }

        const inProgressState = await this._readRebaseState(context.repository, context.signal);
        if (inProgressState.inProgress) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            'A rebase is already in progress. Continue, abort, or skip it before starting another rebase.',
            { rebaseState: inProgressState },
          );
        }

        const upstream = await this._readCurrentBranchUpstream(context.repository, context.signal);
        if (upstream && !options.confirmedPublishedBranch) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            `Branch '${head.currentBranch}' tracks '${upstream}'. Confirm before rebasing a published branch.`,
            { currentBranch: head.currentBranch, upstream },
          );
        }

        const targetCommitSha = await this._resolveRebaseTarget(
          context.repository,
          target,
          context.signal,
        );

        context.reportProgress(0.65, `Rebasing '${head.currentBranch}' onto '${target}'...`);

        const rebaseArgs = ['rebase'];
        if (options.ignoreDate) {
          rebaseArgs.push('--ignore-date');
        }
        rebaseArgs.push('--', targetCommitSha);

        try {
          await this._execGit(context, rebaseArgs);
        } catch (error: unknown) {
          const rebaseState = await this._readRebaseState(context.repository, context.signal);
          if (rebaseState.inProgress) {
            throw new AppError(
              AppErrorCode.GIT_COMMAND_FAILED,
              `Rebase stopped with conflicts in ${rebaseState.unmergedFiles.length} file(s). Resolve conflicts, then continue, abort, or skip the rebase.`,
              { rebaseState, target, currentBranch: head.currentBranch },
            );
          }
          throw error;
        }

        return {
          target,
          targetCommitSha,
          currentBranch: head.currentBranch,
          ...(upstream ? { upstream } : {}),
          ...(options.ignoreDate ? { ignoreDate: true } : {}),
          rebaseState: await this._readRebaseState(context.repository, context.signal),
        };
      },
    });
  }

  public interactiveRebase(
    options: InteractiveRebaseOperationOptions,
  ): Promise<OperationExecutionResult<InteractiveRebaseOperationData>> {
    const onto = options.onto.trim();

    return this.runOperation<InteractiveRebaseOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'rebase-interactive',
      preflight: {
        requireCleanWorktree: true,
        disallowBare: true,
        allowDetachedHead: false,
      },
      execute: async (context) => {
        const head = await this._preflight.checkHead(context.repository);
        if (!head.currentBranch) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            'Interactive rebase requires a checked-out current branch.',
          );
        }

        const inProgressState = await this._readRebaseState(context.repository, context.signal);
        if (inProgressState.inProgress) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            'A rebase is already in progress. Continue, abort, or skip it before starting another rebase.',
            { rebaseState: inProgressState },
          );
        }

        const upstream = await this._readCurrentBranchUpstream(context.repository, context.signal);
        if (upstream && !options.confirmedPublishedBranch) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            `Branch '${head.currentBranch}' tracks '${upstream}'. Confirm before rebasing a published branch.`,
            { currentBranch: head.currentBranch, upstream },
          );
        }

        const ontoSha = await this._resolveRebaseTarget(context.repository, onto, context.signal);
        const todoEntries = [...options.plan].reverse();
        const validation = validateRebasePlan(todoEntries);
        if (!validation.valid) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            validation.error ?? 'The interactive rebase plan is invalid.',
          );
        }
        if (todoEntries.some((entry) => !/^[0-9a-fA-F]{4,64}$/.test(entry.sha))) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            'The interactive rebase plan contains an invalid commit SHA.',
          );
        }

        const session = await this._createInteractiveRebaseSession(
          context.repository,
          todoEntries,
          context.signal,
        );
        this._cleanupInteractiveRebaseSession(context.repository.id);
        this._interactiveRebaseSessions.set(context.repository.id, session);

        context.reportProgress(
          0.6,
          `Applying ${todoEntries.length} commit(s) with interactive rebase...`,
        );

        try {
          await this._execGit(context, ['rebase', '-i', '--', ontoSha], {
            env: this._interactiveRebaseEnv(session),
          });
        } catch (error: unknown) {
          const rebaseState = await this._readRebaseState(context.repository, context.signal);
          if (rebaseState.inProgress) {
            throw new AppError(
              AppErrorCode.GIT_COMMAND_FAILED,
              `Interactive rebase stopped with conflicts in ${rebaseState.unmergedFiles.length} file(s). Resolve conflicts, then continue, abort, or skip the rebase.`,
              { rebaseState, onto, currentBranch: head.currentBranch },
            );
          }
          this._cleanupInteractiveRebaseSession(context.repository.id);
          throw error;
        }

        const rebaseState = await this._readRebaseState(context.repository, context.signal);
        if (!rebaseState.inProgress) {
          this._cleanupInteractiveRebaseSession(context.repository.id);
        }

        return {
          onto,
          ontoSha,
          currentBranch: head.currentBranch,
          ...(upstream ? { upstream } : {}),
          plan: todoEntries,
          rebaseState,
        };
      },
    });
  }

  public continueRebase(
    options: RebaseActionOperationOptions,
  ): Promise<OperationExecutionResult<RebaseActionOperationData>> {
    return this._runRebaseAction(
      options,
      'continue',
      ['rebase', '--continue'],
      'Continuing rebase...',
    );
  }

  public abortRebase(
    options: RebaseActionOperationOptions,
  ): Promise<OperationExecutionResult<RebaseActionOperationData>> {
    return this._runRebaseAction(options, 'abort', ['rebase', '--abort'], 'Aborting rebase...');
  }

  public skipRebase(
    options: RebaseActionOperationOptions,
  ): Promise<OperationExecutionResult<RebaseActionOperationData>> {
    return this._runRebaseAction(
      options,
      'skip',
      ['rebase', '--skip'],
      'Skipping current patch...',
    );
  }

  public cherryPick(
    options: CherryPickOperationOptions,
  ): Promise<OperationExecutionResult<CherryPickOperationData>> {
    const commit = options.commit.trim();
    const noCommit = Boolean(options.noCommit);

    return this.runOperation<CherryPickOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'cherry-pick',
      preflight: {
        requireCleanWorktree: true,
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        await this._ensureNoSequencerOperation(context.repository, context.signal);
        const isRange = commit.includes('..') || commit.includes(' ');
        let commitSha = commit;

        if (!isRange) {
          commitSha = await this._resolveSingleCommitTarget(
            context.repository,
            commit,
            context.signal,
            'Cherry-pick target',
          );
          await this._validateMainlineParent(
            context.repository,
            commitSha,
            options.mainlineParent,
            'Cherry-pick',
            context.signal,
          );
        }

        const args: string[] = ['cherry-pick'];
        if (noCommit) {
          args.push('-n');
        }
        if (options.mainlineParent && !isRange) {
          args.push('-m', String(options.mainlineParent));
        }
        if (!noCommit) {
          args.push('--no-edit');
        }
        args.push(
          '--end-of-options',
          ...(isRange ? commit.split(/\s+/).filter(Boolean) : [commitSha]),
        );

        context.reportProgress(
          0.65,
          noCommit
            ? `Cherry-picking '${commit}' without committing...`
            : `Cherry-picking '${commit}'...`,
        );

        try {
          await this._execGit(context, args);
        } catch (error: unknown) {
          const operationState = await this._readSequencerOperationState(
            context.repository,
            context.signal,
          );
          const unmergedFiles =
            operationState.unmergedFiles.length > 0
              ? operationState.unmergedFiles
              : await this._readUnmergedFiles(context.repository, context.signal);

          if (operationState.inProgress || unmergedFiles.length > 0) {
            const effectiveState: SequencerOperationState = {
              ...operationState,
              inProgress: true,
              operation: operationState.operation ?? 'cherry-pick',
              unmergedFiles,
            };
            throw new AppError(
              AppErrorCode.GIT_COMMAND_FAILED,
              `Cherry-pick stopped with conflicts in ${unmergedFiles.length} file(s). Resolve conflicts, then continue, abort, or skip the cherry-pick.`,
              { operationState: effectiveState, commit, commitSha },
            );
          }
          throw error;
        }

        return {
          commit,
          commitSha,
          ...(options.mainlineParent ? { mainlineParent: options.mainlineParent } : {}),
          ...(noCommit ? { noCommit: true } : {}),
          operationState: await this._readSequencerOperationState(
            context.repository,
            context.signal,
          ),
        };
      },
    });
  }

  public revert(
    options: RevertOperationOptions,
  ): Promise<OperationExecutionResult<RevertOperationData>> {
    const commit = options.commit.trim();

    return this.runOperation<RevertOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'revert',
      preflight: {
        requireCleanWorktree: true,
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        await this._ensureNoSequencerOperation(context.repository, context.signal);
        const commitSha = await this._resolveSingleCommitTarget(
          context.repository,
          commit,
          context.signal,
          'Revert target',
        );
        await this._validateMainlineParent(
          context.repository,
          commitSha,
          options.mainlineParent,
          'Revert',
          context.signal,
        );

        const args = this._buildSingleCommitSequencerArgs(
          'revert',
          commitSha,
          options.mainlineParent,
        );
        context.reportProgress(0.65, `Reverting '${commit}'...`);

        try {
          await this._execGit(context, args);
        } catch (error: unknown) {
          const operationState = await this._readSequencerOperationState(
            context.repository,
            context.signal,
          );
          if (operationState.inProgress) {
            throw new AppError(
              AppErrorCode.GIT_COMMAND_FAILED,
              `Revert stopped with conflicts in ${operationState.unmergedFiles.length} file(s). Resolve conflicts, then continue, abort, or skip the revert.`,
              { operationState, commit, commitSha },
            );
          }
          throw error;
        }

        return {
          commit,
          commitSha,
          ...(options.mainlineParent ? { mainlineParent: options.mainlineParent } : {}),
          operationState: await this._readSequencerOperationState(
            context.repository,
            context.signal,
          ),
        };
      },
    });
  }

  public continueCherryPick(
    options: SequencerActionOperationOptions,
  ): Promise<OperationExecutionResult<SequencerActionOperationData>> {
    return this._runSequencerAction(
      options,
      'cherry-pick',
      'continue',
      ['cherry-pick', '--continue'],
      'Continuing cherry-pick...',
    );
  }

  public abortCherryPick(
    options: SequencerActionOperationOptions,
  ): Promise<OperationExecutionResult<SequencerActionOperationData>> {
    return this._runSequencerAction(
      options,
      'cherry-pick',
      'abort',
      ['cherry-pick', '--abort'],
      'Aborting cherry-pick...',
    );
  }

  public skipCherryPick(
    options: SequencerActionOperationOptions,
  ): Promise<OperationExecutionResult<SequencerActionOperationData>> {
    return this._runSequencerAction(
      options,
      'cherry-pick',
      'skip',
      ['cherry-pick', '--skip'],
      'Skipping cherry-pick...',
    );
  }

  public continueRevert(
    options: SequencerActionOperationOptions,
  ): Promise<OperationExecutionResult<SequencerActionOperationData>> {
    return this._runSequencerAction(
      options,
      'revert',
      'continue',
      ['revert', '--continue'],
      'Continuing revert...',
    );
  }

  public abortRevert(
    options: SequencerActionOperationOptions,
  ): Promise<OperationExecutionResult<SequencerActionOperationData>> {
    return this._runSequencerAction(
      options,
      'revert',
      'abort',
      ['revert', '--abort'],
      'Aborting revert...',
    );
  }

  public skipRevert(
    options: SequencerActionOperationOptions,
  ): Promise<OperationExecutionResult<SequencerActionOperationData>> {
    return this._runSequencerAction(
      options,
      'revert',
      'skip',
      ['revert', '--skip'],
      'Skipping revert...',
    );
  }

  public reset(
    options: ResetOperationOptions,
  ): Promise<OperationExecutionResult<ResetOperationData>> {
    const target = options.target.trim();
    const mode = options.mode;

    return this.runOperation<ResetOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'reset',
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        const targetCommitSha = await this._resolveSingleCommitTarget(
          context.repository,
          target,
          context.signal,
          'Reset target',
        );

        if (mode === 'hard' && !options.confirmedHardReset) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            `Hard reset to '${targetCommitSha}' requires explicit modal confirmation because uncommitted changes can be lost.`,
            { target, targetCommitSha, mode },
          );
        }

        context.reportProgress(0.65, `Resetting ${mode} to '${targetCommitSha}'...`);
        await this._execGit(context, ['reset', `--${mode}`, targetCommitSha]);

        return {
          target,
          targetCommitSha,
          mode,
        };
      },
    });
  }

  public fetch(
    options: FetchOperationOptions,
  ): Promise<OperationExecutionResult<FetchOperationData>> {
    const prune = options.prune ?? true;
    const remote = options.remote?.trim();
    const all = Boolean(options.all) || !remote;

    return this.runOperation<FetchOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'fetch',
      preflight: {
        disallowBare: false,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        const remotes = await context.repository.getRemotes();
        if (remotes.length === 0) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            'No remote repositories configured to fetch from.',
          );
        }

        const args = ['fetch'];
        if (remote && !all) {
          args.push(remote);
        } else {
          args.push('--all');
        }
        if (prune) {
          args.push('--prune');
        }

        context.reportProgress(
          0.5,
          remote && !all ? `Fetching from remote '${remote}'...` : 'Fetching from all remotes...',
        );
        await this._execGit(context, args);

        return {
          remote: remote && !all ? remote : 'all',
          pruned: prune,
        };
      },
    });
  }

  public pull(options: PullOperationOptions): Promise<OperationExecutionResult<PullOperationData>> {
    const branch = options.branch?.trim();
    const remote = options.remote?.trim() || (branch ? 'origin' : undefined);
    const strategy = options.strategy ?? 'merge';
    const autostash = Boolean(options.autostash);

    return this.runOperation<PullOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'pull',
      preflight: {
        requireCleanWorktree: !autostash,
        disallowBare: true,
        allowDetachedHead: false,
      },
      execute: async (context) => {
        if (
          remote &&
          // eslint-disable-next-line no-control-regex
          (remote.startsWith('-') || /[\s\x00-\x1f\x7f]/.test(remote))
        ) {
          throw new AppError(AppErrorCode.GIT_COMMAND_FAILED, 'Invalid remote name.');
        }
        if (branch) {
          if (branch.startsWith('-')) {
            throw new AppError(AppErrorCode.GIT_COMMAND_FAILED, 'Invalid branch name.');
          }
          const validation = await this._preflight.validateRefName(
            context.repository,
            branch,
            true,
          );
          if (!validation.valid) {
            throw new AppError(
              AppErrorCode.GIT_COMMAND_FAILED,
              validation.error || 'Invalid branch name.',
            );
          }
        }

        const args = ['pull'];
        if (strategy === 'rebase') {
          args.push('--rebase');
        } else if (strategy === 'ff-only') {
          args.push('--ff-only');
        }
        if (autostash) {
          args.push('--autostash');
        }
        if (remote) {
          args.push(remote);
        }
        if (branch) {
          args.push(branch);
        }

        context.reportProgress(
          0.5,
          remote || branch
            ? `Pulling ${branch ? `'${branch}' ` : ''}from '${remote ?? 'upstream'}'...`
            : 'Pulling from upstream...',
        );
        await this._execGit(context, args);

        return {
          remote,
          branch,
          strategy,
          autostashed: autostash,
        };
      },
    });
  }

  public addRemote(
    options: AddRemoteOperationOptions,
  ): Promise<OperationExecutionResult<RemoteOperationData>> {
    const name = this._normalizeRemoteName(options.name);
    const url = options.url.trim();
    if (!url || url.startsWith('-')) {
      throw new AppError(AppErrorCode.GIT_COMMAND_FAILED, 'A valid remote URL is required.');
    }

    return this.runOperation<RemoteOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'remote-add',
      preflight: { disallowBare: true, allowDetachedHead: true },
      execute: async (context) => {
        context.reportProgress(0.5, `Adding remote '${name}'...`);
        await this._execGit(context, ['remote', 'add', name, url]);
        return { name };
      },
    });
  }

  public removeRemote(
    options: RemoveRemoteOperationOptions,
  ): Promise<OperationExecutionResult<RemoteOperationData>> {
    const name = this._normalizeRemoteName(options.name);

    return this.runOperation<RemoteOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'remote-remove',
      preflight: { disallowBare: true, allowDetachedHead: true },
      execute: async (context) => {
        context.reportProgress(0.5, `Removing remote '${name}'...`);
        await this._execGit(context, ['remote', 'remove', name]);
        return { name };
      },
    });
  }

  public renameRemote(
    options: RenameRemoteOperationOptions,
  ): Promise<OperationExecutionResult<RemoteOperationData>> {
    const oldName = this._normalizeRemoteName(options.oldName);
    const newName = this._normalizeRemoteName(options.newName);

    return this.runOperation<RemoteOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'remote-rename',
      preflight: { disallowBare: true, allowDetachedHead: true },
      execute: async (context) => {
        context.reportProgress(0.5, `Renaming remote '${oldName}' to '${newName}'...`);
        await this._execGit(context, ['remote', 'rename', oldName, newName]);
        return { name: newName };
      },
    });
  }

  public setRemoteUrl(
    options: SetRemoteUrlOperationOptions,
  ): Promise<OperationExecutionResult<RemoteOperationData>> {
    const name = this._normalizeRemoteName(options.name);
    const url = options.url.trim();
    if (!url || url.startsWith('-')) {
      throw new AppError(AppErrorCode.GIT_COMMAND_FAILED, 'A valid remote URL is required.');
    }

    return this.runOperation<RemoteOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'remote-set-url',
      preflight: { disallowBare: true, allowDetachedHead: true },
      execute: async (context) => {
        context.reportProgress(0.5, `Updating URL for remote '${name}'...`);
        const args = ['remote', 'set-url'];
        if (options.push) {
          args.push('--push');
        }
        args.push(name, url);
        await this._execGit(context, args);
        return { name };
      },
    });
  }

  public async listReflog(repositoryId: string, limit = 20): Promise<ReflogEntry[]> {
    const repository = this._repositoryManager.getRepository(repositoryId);
    if (!repository) {
      throw new AppError(AppErrorCode.NOT_A_REPOSITORY, `Repository '${repositoryId}' not found.`);
    }
    return repository.listReflog(limit);
  }

  public async getSyncStatus(repositoryId: string): Promise<RepositorySyncStatus> {
    const repository = this._repositoryManager.getRepository(repositoryId);
    if (!repository) {
      throw new AppError(AppErrorCode.NOT_A_REPOSITORY, `Repository '${repositoryId}' not found.`);
    }

    const refs = await repository.getRefs();
    const currentBranch = refs.currentBranch;
    if (!currentBranch) {
      return { repositoryId, ahead: 0, behind: 0 };
    }

    const localBranch = refs.localBranches.find((branch) => branch.name === currentBranch);
    const upstream = localBranch?.upstream;
    if (!upstream) {
      return { repositoryId, currentBranch, ahead: 0, behind: 0 };
    }

    const result = await repository.exec([
      'rev-list',
      '--left-right',
      '--count',
      `${currentBranch}...${upstream}`,
    ]);
    if (result.exitCode !== 0) {
      return { repositoryId, currentBranch, upstream, ahead: 0, behind: 0 };
    }

    const [aheadRaw = '0', behindRaw = '0'] = result.stdout.trim().split(/\s+/);
    return {
      repositoryId,
      currentBranch,
      upstream,
      ahead: Number.parseInt(aheadRaw, 10) || 0,
      behind: Number.parseInt(behindRaw, 10) || 0,
    };
  }

  public async undo(
    options: UndoOperationOptions,
  ): Promise<OperationExecutionResult<UndoOperationData>> {
    return this.runOperation<UndoOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'undo',
      preflight: {
        requireCleanWorktree: true,
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        const entries = await context.repository.listReflog(40, context.signal);
        const reflogIndex = options.reflogIndex ?? 1;
        const target = options.expectedSha
          ? entries.find((entry) => entry.sha === options.expectedSha)
          : entries.find((entry) => entry.index === reflogIndex);

        if (!target) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            'The previous repository state is no longer available in the reflog.',
          );
        }
        if (/^0+$/.test(target.sha)) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            'The previous state cannot be restored because it did not exist.',
          );
        }

        const previousHeadSha = await this._readHeadSha(context.repository, context.signal);
        context.reportProgress(0.5, `Restoring ${target.shortSha}...`);
        await this._execGit(context, ['reset', '--hard', target.sha]);

        return {
          targetSha: target.sha,
          reflogIndex: target.index,
          previousHeadSha,
        };
      },
    });
  }

  public stageWorktree(
    options: StageWorktreeOperationOptions,
  ): Promise<OperationExecutionResult<StageWorktreeOperationData>> {
    const all = Boolean(options.all);
    const paths = options.paths.map((p) => p.trim()).filter(Boolean);

    return this.runOperation<StageWorktreeOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'worktree-stage',
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        if (!all && paths.length === 0) {
          throw new AppError(AppErrorCode.GIT_COMMAND_FAILED, 'No paths were provided to stage.');
        }
        context.reportProgress(0.6, all ? 'Staging all changes...' : 'Staging files...');
        if (all) {
          await this._execGit(context, ['add', '-A', '--', '.']);
        } else {
          await this._execGit(context, ['add', '-A', '--', ...paths]);
        }
        return { paths, all };
      },
    });
  }

  public unstageWorktree(
    options: StageWorktreeOperationOptions,
  ): Promise<OperationExecutionResult<StageWorktreeOperationData>> {
    const all = Boolean(options.all);
    const paths = options.paths.map((p) => p.trim()).filter(Boolean);

    return this.runOperation<StageWorktreeOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'worktree-unstage',
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        if (!all && paths.length === 0) {
          throw new AppError(AppErrorCode.GIT_COMMAND_FAILED, 'No paths were provided to unstage.');
        }
        context.reportProgress(0.6, all ? 'Unstaging all changes...' : 'Unstaging files...');
        const targetPaths = all ? ['.'] : paths;
        const head = await context.repository.exec(['rev-parse', '-q', '--verify', 'HEAD'], {
          signal: context.signal,
        });
        if (head.exitCode === 0) {
          await this._execGit(context, ['reset', '-q', 'HEAD', '--', ...targetPaths]);
        } else {
          await this._execGit(context, [
            'rm',
            '--cached',
            '-r',
            '-q',
            '--ignore-unmatch',
            '--',
            ...targetPaths,
          ]);
        }
        return { paths, all };
      },
    });
  }

  public discardWorktree(
    options: DiscardWorktreeOperationOptions,
  ): Promise<OperationExecutionResult<DiscardWorktreeOperationData>> {
    const all = Boolean(options.all);
    const paths = options.paths.map((p) => p.trim()).filter(Boolean);

    return this.runOperation<DiscardWorktreeOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'worktree-discard',
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        if (!all && paths.length === 0) {
          throw new AppError(AppErrorCode.GIT_COMMAND_FAILED, 'No paths were provided to discard.');
        }
        context.reportProgress(0.5, 'Discarding changes...');
        await context.repository.discardWorktree({
          paths,
          all,
        });
        return { paths, all };
      },
    });
  }

  public addGitWorktree(
    options: AddGitWorktreeOperationOptions,
  ): Promise<OperationExecutionResult<AddGitWorktreeOperationData>> {
    const worktreePath = options.path.trim();
    const branch = options.branch?.trim();
    const newBranch = options.newBranch?.trim();

    return this.runOperation<AddGitWorktreeOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'worktree-add',
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        if (!worktreePath) {
          throw new AppError(AppErrorCode.GIT_COMMAND_FAILED, t('Worktree path is required.'));
        }
        context.reportProgress(0.5, t('Creating worktree...'));
        await context.repository.addWorktree({
          path: worktreePath,
          ...(branch ? { branch } : {}),
          ...(newBranch ? { newBranch } : {}),
        });
        return {
          path: worktreePath,
          ...(branch ? { branch } : {}),
          ...(newBranch ? { newBranch } : {}),
        };
      },
    });
  }

  public removeGitWorktree(
    options: RemoveGitWorktreeOperationOptions,
  ): Promise<OperationExecutionResult<RemoveGitWorktreeOperationData>> {
    const worktreePath = options.path.trim();
    const force = Boolean(options.force);

    return this.runOperation<RemoveGitWorktreeOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'worktree-remove',
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        if (!worktreePath) {
          throw new AppError(AppErrorCode.GIT_COMMAND_FAILED, t('Worktree path is required.'));
        }
        context.reportProgress(
          0.5,
          force ? t('Force removing worktree...') : t('Removing worktree...'),
        );
        await context.repository.removeWorktree(worktreePath, force);
        return { path: worktreePath, force };
      },
    });
  }

  public createCommit(
    options: CreateCommitOperationOptions,
  ): Promise<OperationExecutionResult<CreateCommitOperationData>> {
    const message = options.message.trim();
    const description = options.description?.trim();
    const amend = Boolean(options.amend);

    return this.runOperation<CreateCommitOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'commit-create',
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        if (!message) {
          throw new AppError(AppErrorCode.GIT_COMMAND_FAILED, 'Commit message cannot be empty.');
        }

        if (!amend) {
          const staged = await context.repository.exec(['diff', '--cached', '--name-only', '--'], {
            signal: context.signal,
          });
          if (staged.exitCode !== 0 || staged.stdout.trim().length === 0) {
            throw new AppError(
              AppErrorCode.GIT_COMMAND_FAILED,
              'There are no staged changes to commit.',
            );
          }
        }

        context.reportProgress(0.6, amend ? 'Amending previous commit...' : 'Creating commit...');
        const args = ['commit', '-m', message];
        if (description) {
          args.push('-m', description);
        }
        if (amend) {
          args.push('--amend');
        }
        await this._execGit(context, args);

        const sha = (
          await context.repository.exec(['rev-parse', 'HEAD'], { signal: context.signal })
        ).stdout.trim();
        const subject = (
          await context.repository.exec(['log', '-1', '--format=%s', 'HEAD'], {
            signal: context.signal,
          })
        ).stdout.trim();

        return { sha, subject, amended: amend };
      },
    });
  }

  public saveStash(
    options: SaveStashOperationOptions,
  ): Promise<OperationExecutionResult<SaveStashOperationData>> {
    const includeUntracked = Boolean(options.includeUntracked);
    const keepIndex = Boolean(options.keepIndex);
    const message = options.message?.trim();

    return this.runOperation<SaveStashOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: 'stash-save',
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        context.reportProgress(0.6, 'Saving stash...');
        await context.repository.saveStash({
          ...(message ? { message } : {}),
          includeUntracked,
          keepIndex,
        });
        return {
          ...(message ? { message } : {}),
          includeUntracked,
          keepIndex,
        };
      },
    });
  }

  public popStash(
    options: StashActionOperationOptions,
  ): Promise<OperationExecutionResult<StashActionOperationData>> {
    return this._runStashAction(options, 'pop');
  }

  public applyStash(
    options: StashActionOperationOptions,
  ): Promise<OperationExecutionResult<StashActionOperationData>> {
    return this._runStashAction(options, 'apply');
  }

  public dropStash(
    options: StashActionOperationOptions,
  ): Promise<OperationExecutionResult<StashActionOperationData>> {
    return this._runStashAction(options, 'drop');
  }

  private _runStashAction(
    options: StashActionOperationOptions,
    action: 'pop' | 'apply' | 'drop',
  ): Promise<OperationExecutionResult<StashActionOperationData>> {
    const index = options.index;

    return this.runOperation<StashActionOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: `stash-${action}`,
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        if (!Number.isInteger(index) || index < 0) {
          throw new AppError(AppErrorCode.GIT_COMMAND_FAILED, `Invalid stash index: ${index}.`);
        }

        const ref = `stash@{${index}}`;
        context.reportProgress(
          0.6,
          `${action === 'pop' ? 'Popping' : action === 'apply' ? 'Applying' : 'Dropping'} ${ref}...`,
        );
        if (action === 'pop') {
          await this._execGit(context, ['stash', 'pop', ref]);
        } else if (action === 'apply') {
          await this._execGit(context, ['stash', 'apply', ref]);
        } else {
          await this._execGit(context, ['stash', 'drop', ref]);
        }
        return { action, index, ref };
      },
    });
  }

  private _runSequencerAction(
    options: SequencerActionOperationOptions,
    operation: 'cherry-pick' | 'revert',
    action: SequencerActionOperationData['action'],
    args: string[],
    progressMessage: string,
  ): Promise<OperationExecutionResult<SequencerActionOperationData>> {
    return this.runOperation<SequencerActionOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: `${operation}-${action}`,
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        const operationStateBeforeAction = await this._readSequencerOperationState(
          context.repository,
          context.signal,
        );
        if (
          !operationStateBeforeAction.inProgress ||
          operationStateBeforeAction.operation !== operation
        ) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            `No ${operation} is currently in progress.`,
          );
        }

        context.reportProgress(0.65, progressMessage);

        try {
          await this._execGit(context, args);
        } catch (error: unknown) {
          if (action === 'abort') {
            try {
              await this._execGit(context, ['reset', '--merge']);
              return {
                operation,
                action,
                operationStateBeforeAction,
                operationState: await this._readSequencerOperationState(
                  context.repository,
                  context.signal,
                ),
              };
            } catch {
              // fallback failed, continue to standard error handling
            }
          }
          const operationState = await this._readSequencerOperationState(
            context.repository,
            context.signal,
          );
          if (operationState.inProgress) {
            throw new AppError(
              AppErrorCode.GIT_COMMAND_FAILED,
              `${operation} ${action} stopped with conflicts in ${operationState.unmergedFiles.length} file(s). Resolve conflicts, then continue, abort, or skip the ${operation}.`,
              { operationState, operation, action },
            );
          }
          throw error;
        }

        return {
          operation,
          action,
          operationStateBeforeAction,
          operationState: await this._readSequencerOperationState(
            context.repository,
            context.signal,
          ),
        };
      },
    });
  }

  private _runRebaseAction(
    options: RebaseActionOperationOptions,
    action: RebaseActionOperationData['action'],
    args: string[],
    progressMessage: string,
  ): Promise<OperationExecutionResult<RebaseActionOperationData>> {
    return this.runOperation<RebaseActionOperationData>({
      operationId: options.operationId,
      repositoryId: options.repositoryId,
      type: `rebase-${action}`,
      preflight: {
        disallowBare: true,
        allowDetachedHead: true,
      },
      execute: async (context) => {
        const rebaseStateBeforeAction = await this._readRebaseState(
          context.repository,
          context.signal,
        );
        if (!rebaseStateBeforeAction.inProgress) {
          throw new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            'No rebase is currently in progress.',
          );
        }

        context.reportProgress(0.65, progressMessage);

        const session = this._interactiveRebaseSessions.get(context.repository.id);
        const env = session && action !== 'abort' ? this._interactiveRebaseEnv(session) : undefined;

        try {
          await this._execGit(context, args, env ? { env } : undefined);
        } catch (error: unknown) {
          const rebaseState = await this._readRebaseState(context.repository, context.signal);
          if (rebaseState.inProgress) {
            throw new AppError(
              AppErrorCode.GIT_COMMAND_FAILED,
              `Rebase ${action} stopped with conflicts in ${rebaseState.unmergedFiles.length} file(s). Resolve conflicts, then continue, abort, or skip the rebase.`,
              { rebaseState, action },
            );
          }
          this._cleanupInteractiveRebaseSession(context.repository.id);
          throw error;
        }

        const rebaseState = await this._readRebaseState(context.repository, context.signal);
        if (action === 'abort' || !rebaseState.inProgress) {
          this._cleanupInteractiveRebaseSession(context.repository.id);
        }

        return {
          action,
          rebaseStateBeforeAction,
          rebaseState,
        };
      },
    });
  }

  private async _checkoutLocalBranch(
    context: OperationContext,
    target: string,
  ): Promise<CheckoutOperationData> {
    const branchName = this._normalizeLocalBranchName(target);
    const args = ['checkout', branchName, '--'];

    context.reportProgress(0.65, `Checking out local branch '${branchName}'...`);
    await this._execGit(context, args);

    return {
      target: branchName,
      targetType: 'localBranch',
      checkedOutRef: `refs/heads/${branchName}`,
      detachedHead: false,
      localBranchName: branchName,
    };
  }

  private async _checkoutRemoteBranch(
    context: OperationContext,
    target: string,
    localBranchName: string | undefined,
    options: CheckoutOperationOptions,
  ): Promise<CheckoutOperationData> {
    if (!localBranchName) {
      throw new AppError(
        AppErrorCode.GIT_COMMAND_FAILED,
        `${REMOTE_TRACKING_WARNING} Confirm the local branch name before continuing.`,
      );
    }
    if (!options.confirmedRemoteTracking) {
      throw new AppError(
        AppErrorCode.GIT_COMMAND_FAILED,
        `${REMOTE_TRACKING_WARNING} Confirm '${localBranchName}' as the local branch name before continuing.`,
      );
    }

    const remoteRef = this._normalizeRemoteBranchRef(target);
    await this._verifyExactRef(context.repository, remoteRef, context.signal, 'Remote branch');

    const branchExists = await this._preflight.branchExists(context.repository, localBranchName);

    if (branchExists) {
      const headCheck = await context.repository.exec(['symbolic-ref', '--short', 'HEAD'], {
        signal: context.signal,
      });
      const currentBranch = headCheck.exitCode === 0 ? headCheck.stdout.trim() : undefined;
      if (currentBranch !== localBranchName) {
        context.reportProgress(0.35, `Checking out existing local branch '${localBranchName}'...`);
        await this._execGit(context, ['checkout', localBranchName, '--']);
      }
      context.reportProgress(
        0.7,
        `Synchronizing '${localBranchName}' with '${this._shortRemoteBranchName(remoteRef)}'...`,
      );
      try {
        await this._execGit(context, ['merge', '--ff-only', remoteRef]);
      } catch {
        await this._execGit(context, ['merge', '--no-edit', remoteRef]);
      }
    } else {
      const args = ['checkout', '--track', '-b', localBranchName, remoteRef, '--'];
      context.reportProgress(
        0.65,
        `Creating '${localBranchName}' to track '${this._shortRemoteBranchName(remoteRef)}'...`,
      );
      await this._execGit(context, args);
    }

    return {
      target: this._shortRemoteBranchName(remoteRef),
      targetType: 'remoteBranch',
      checkedOutRef: `refs/heads/${localBranchName}`,
      detachedHead: false,
      localBranchName,
      upstream: this._shortRemoteBranchName(remoteRef),
    };
  }

  private async _checkoutDetachedTarget(
    context: OperationContext,
    target: string,
    targetType: 'tag' | 'commit',
    options: CheckoutOperationOptions,
  ): Promise<CheckoutOperationData> {
    if (!options.confirmedDetachedHead) {
      throw new AppError(AppErrorCode.GIT_COMMAND_FAILED, DETACHED_HEAD_WARNING);
    }

    const checkoutTarget =
      targetType === 'tag'
        ? await this._resolveTagTarget(context.repository, target, context.signal)
        : await this._resolveCommitTarget(context.repository, target, context.signal);
    const args = ['checkout', '--detach', checkoutTarget, '--'];

    context.reportProgress(0.65, `Checking out ${targetType} '${target}' in detached HEAD...`);
    await this._execGit(context, args);

    return {
      target,
      targetType,
      checkedOutRef: checkoutTarget,
      detachedHead: true,
      warning: DETACHED_HEAD_WARNING,
    };
  }

  private async _resolveTagTarget(
    repository: GitRepository,
    target: string,
    signal: AbortSignal,
  ): Promise<string> {
    const tagName = target.replace(/^refs\/tags\//, '');
    const validation = await this._preflight.validateRefName(repository, tagName);
    if (!validation.valid) {
      throw new AppError(
        AppErrorCode.GIT_COMMAND_FAILED,
        validation.error ?? `'${target}' is not a valid tag name.`,
      );
    }

    const fullRef = `refs/tags/${tagName}`;
    await this._verifyCommitish(repository, fullRef, signal, 'Tag');
    return fullRef;
  }

  private async _resolveCommitTarget(
    repository: GitRepository,
    target: string,
    signal: AbortSignal,
  ): Promise<string> {
    if (!/^[0-9a-fA-F]{7,64}$/.test(target)) {
      throw new AppError(
        AppErrorCode.GIT_COMMAND_FAILED,
        'Commit target must be a hexadecimal commit ID with at least 7 characters.',
      );
    }

    await this._verifyCommitish(repository, target, signal, 'Commit');
    return target;
  }

  private async _verifyExactRef(
    repository: GitRepository,
    fullRef: string,
    signal: AbortSignal,
    label: string,
  ): Promise<void> {
    try {
      const result = await repository.exec(['show-ref', '--verify', '--quiet', fullRef], {
        signal,
      });
      if (result.exitCode === 0) {
        return;
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        throw error;
      }
    }

    throw new AppError(AppErrorCode.GIT_COMMAND_FAILED, `${label} '${fullRef}' was not found.`);
  }

  private async _verifyCommitish(
    repository: GitRepository,
    target: string,
    signal: AbortSignal,
    label: string,
  ): Promise<void> {
    try {
      const result = await repository.exec(
        ['rev-parse', '--verify', '--end-of-options', `${target}^{commit}`],
        { signal },
      );
      if (result.exitCode === 0) {
        return;
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        throw error;
      }
    }

    throw new AppError(AppErrorCode.GIT_COMMAND_FAILED, `${label} '${target}' was not found.`);
  }

  private async _resolveStartPoint(
    repository: GitRepository,
    startPoint: string,
    signal: AbortSignal,
  ): Promise<string> {
    try {
      const result = await repository.exec(
        ['rev-parse', '--verify', '--end-of-options', `${startPoint}^{commit}`],
        { signal },
      );
      const commitSha = result.stdout.trim().split('\n')[0];
      if (result.exitCode === 0 && commitSha) {
        return commitSha;
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        throw error;
      }
    }

    throw new AppError(
      AppErrorCode.GIT_COMMAND_FAILED,
      `Start point '${startPoint}' does not resolve to a commit.`,
    );
  }

  private async _resolveTagCreationTarget(
    repository: GitRepository,
    target: string,
    signal: AbortSignal,
  ): Promise<string> {
    try {
      const result = await repository.exec(
        ['rev-parse', '--verify', '--end-of-options', `${target}^{commit}`],
        { signal },
      );
      const commitSha = result.stdout.trim().split('\n')[0];
      if (result.exitCode === 0 && commitSha) {
        return commitSha;
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        throw error;
      }
    }

    throw new AppError(
      AppErrorCode.GIT_COMMAND_FAILED,
      `Tag target '${target}' does not resolve to a commit.`,
    );
  }

  private async _resolveMergeTarget(
    repository: GitRepository,
    target: string,
    signal: AbortSignal,
  ): Promise<string> {
    try {
      const result = await repository.exec(
        ['rev-parse', '--verify', '--end-of-options', `${target}^{commit}`],
        { signal },
      );
      const commitSha = result.stdout.trim().split('\n')[0];
      if (result.exitCode === 0 && commitSha) {
        return commitSha;
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        throw error;
      }
    }

    throw new AppError(
      AppErrorCode.GIT_COMMAND_FAILED,
      `Merge target '${target}' does not resolve to a commit.`,
    );
  }

  private async _resolveRebaseTarget(
    repository: GitRepository,
    target: string,
    signal: AbortSignal,
  ): Promise<string> {
    try {
      const result = await repository.exec(
        ['rev-parse', '--verify', '--end-of-options', `${target}^{commit}`],
        { signal },
      );
      const commitSha = result.stdout.trim().split('\n')[0];
      if (result.exitCode === 0 && commitSha) {
        return commitSha;
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        throw error;
      }
    }

    throw new AppError(
      AppErrorCode.GIT_COMMAND_FAILED,
      `Rebase target '${target}' does not resolve to a commit.`,
    );
  }

  private async _resolveSingleCommitTarget(
    repository: GitRepository,
    target: string,
    signal: AbortSignal,
    label: string,
  ): Promise<string> {
    try {
      const result = await repository.exec(
        ['rev-parse', '--verify', '--end-of-options', `${target}^{commit}`],
        { signal },
      );
      const commitSha = result.stdout.trim().split('\n')[0];
      if (result.exitCode === 0 && commitSha) {
        return commitSha;
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        throw error;
      }
    }

    throw new AppError(
      AppErrorCode.GIT_COMMAND_FAILED,
      `${label} '${target}' does not resolve to a commit.`,
    );
  }

  private async _validateMainlineParent(
    repository: GitRepository,
    commitSha: string,
    mainlineParent: number | undefined,
    operationLabel: string,
    signal: AbortSignal,
  ): Promise<void> {
    const parentCount = await this._readParentCount(repository, commitSha, signal);
    if (parentCount > 1) {
      if (!mainlineParent) {
        throw new AppError(
          AppErrorCode.GIT_COMMAND_FAILED,
          `${operationLabel} target is a merge commit. Choose the mainline parent before continuing.`,
          { commitSha, parentCount },
        );
      }
      if (!Number.isInteger(mainlineParent) || mainlineParent < 1 || mainlineParent > parentCount) {
        throw new AppError(
          AppErrorCode.GIT_COMMAND_FAILED,
          `Mainline parent must be between 1 and ${parentCount} for this merge commit.`,
          { commitSha, parentCount, mainlineParent },
        );
      }
      return;
    }

    if (mainlineParent !== undefined) {
      throw new AppError(
        AppErrorCode.GIT_COMMAND_FAILED,
        `${operationLabel} target is not a merge commit, so a mainline parent is not applicable.`,
        { commitSha, parentCount, mainlineParent },
      );
    }
  }

  private async _readParentCount(
    repository: GitRepository,
    commitSha: string,
    signal: AbortSignal,
  ): Promise<number> {
    const result = await repository.exec(['rev-list', '--parents', '-n', '1', commitSha], {
      signal,
    });
    if (result.exitCode !== 0) {
      throw new GitCommandError(result.stderr || 'Unable to inspect commit parents.', {
        command: 'git',
        args: ['rev-list', '--parents', '-n', '1', commitSha],
        exitCode: result.exitCode,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
      });
    }

    const parts = result.stdout.trim().split(/\s+/).filter(Boolean);
    return Math.max(0, parts.length - 1);
  }

  private _buildSingleCommitSequencerArgs(
    operation: 'cherry-pick' | 'revert',
    commitSha: string,
    mainlineParent: number | undefined,
  ): string[] {
    const args: string[] = [operation];
    if (mainlineParent) {
      args.push('-m', String(mainlineParent));
    }
    args.push('--no-edit', '--end-of-options', commitSha);
    return args;
  }

  private async _ensureNoSequencerOperation(
    repository: GitRepository,
    signal: AbortSignal,
  ): Promise<void> {
    const operationState = await this._readSequencerOperationState(repository, signal);
    if (operationState.inProgress) {
      throw new AppError(
        AppErrorCode.GIT_COMMAND_FAILED,
        `A ${operationState.operation ?? 'sequencer operation'} is already in progress. Continue, abort, or skip it before starting another operation.`,
        { operationState },
      );
    }
  }

  private async _readCurrentBranchUpstream(
    repository: GitRepository,
    signal: AbortSignal,
  ): Promise<string | undefined> {
    try {
      const result = await repository.exec(
        ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
        { signal },
      );
      if (result.exitCode === 0) {
        return result.stdout.trim().split('\n')[0] || undefined;
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        throw error;
      }
    }
    return undefined;
  }

  private async _readMergeState(
    repository: GitRepository,
    signal: AbortSignal,
  ): Promise<MergeState> {
    let targetSha: string | undefined;
    let headSha: string | undefined;
    const unmergedFiles: string[] = [];

    try {
      const mergeHeadResult = await repository.exec(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], {
        signal,
      });
      if (mergeHeadResult.exitCode === 0) {
        targetSha = mergeHeadResult.stdout.trim().split('\n')[0] || undefined;
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        throw error;
      }
    }

    try {
      const headResult = await repository.exec(['rev-parse', '-q', '--verify', 'HEAD'], { signal });
      if (headResult.exitCode === 0) {
        headSha = headResult.stdout.trim().split('\n')[0] || undefined;
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        throw error;
      }
    }

    try {
      const unmergedResult = await repository.exec(
        ['diff', '--name-only', '--diff-filter=U', '--'],
        { signal },
      );
      if (unmergedResult.exitCode === 0) {
        unmergedFiles.push(
          ...unmergedResult.stdout
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        );
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        throw error;
      }
    }

    return {
      inProgress: Boolean(targetSha || unmergedFiles.length > 0),
      ...(headSha ? { headSha } : {}),
      ...(targetSha ? { targetSha } : {}),
      unmergedFiles,
    };
  }

  private async _readRebaseState(
    repository: GitRepository,
    signal: AbortSignal,
  ): Promise<RebaseState> {
    const rebaseMergePath = await this._resolveGitPath(repository, 'rebase-merge', signal);
    const rebaseApplyPath = await this._resolveGitPath(repository, 'rebase-apply', signal);
    const statePath = fs.existsSync(rebaseMergePath)
      ? rebaseMergePath
      : fs.existsSync(rebaseApplyPath)
        ? rebaseApplyPath
        : undefined;

    const headSha = await this._readOptionalRevision(repository, 'HEAD', signal);
    const currentPatchSha = await this._readOptionalRevision(repository, 'REBASE_HEAD', signal);
    const originalHeadSha = statePath
      ? await this._readGitStateFile(statePath, 'orig-head')
      : undefined;
    const ontoSha = statePath ? await this._readGitStateFile(statePath, 'onto') : undefined;
    const unmergedFiles = statePath ? await this._readUnmergedFiles(repository, signal) : [];
    const completedSteps = statePath
      ? await this._countRebaseCommands(path.join(statePath, 'done'))
      : undefined;
    const remainingSteps = statePath
      ? await this._countRebaseCommands(path.join(statePath, 'git-rebase-todo'))
      : undefined;
    const totalSteps =
      completedSteps !== undefined && remainingSteps !== undefined
        ? completedSteps + remainingSteps + 1
        : undefined;

    return {
      inProgress: Boolean(statePath),
      ...(headSha ? { headSha } : {}),
      ...(originalHeadSha ? { originalHeadSha } : {}),
      ...(ontoSha ? { ontoSha } : {}),
      ...(currentPatchSha ? { currentPatchSha } : {}),
      ...(completedSteps !== undefined ? { completedSteps } : {}),
      ...(totalSteps !== undefined ? { totalSteps } : {}),
      unmergedFiles,
    };
  }

  private async _countRebaseCommands(filePath: string): Promise<number | undefined> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return content.split('\n').filter((line) => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('#');
      }).length;
    } catch {
      return undefined;
    }
  }

  private async _readSequencerOperationState(
    repository: GitRepository,
    signal: AbortSignal,
  ): Promise<SequencerOperationState> {
    const headSha = await this._readOptionalRevision(repository, 'HEAD', signal);
    const cherryPickHeadSha = await this._readOptionalRevision(
      repository,
      'CHERRY_PICK_HEAD',
      signal,
    );
    const revertHeadSha = await this._readOptionalRevision(repository, 'REVERT_HEAD', signal);
    const operation = cherryPickHeadSha ? 'cherry-pick' : revertHeadSha ? 'revert' : undefined;
    const targetSha = cherryPickHeadSha ?? revertHeadSha;
    const unmergedFiles = targetSha ? await this._readUnmergedFiles(repository, signal) : [];

    return {
      inProgress: Boolean(targetSha),
      ...(operation ? { operation } : {}),
      ...(headSha ? { headSha } : {}),
      ...(targetSha ? { targetSha } : {}),
      unmergedFiles,
    };
  }

  private async _readOptionalRevision(
    repository: GitRepository,
    revision: string,
    signal: AbortSignal,
  ): Promise<string | undefined> {
    try {
      const result = await repository.exec(['rev-parse', '-q', '--verify', revision], { signal });
      if (result.exitCode === 0) {
        return result.stdout.trim().split('\n')[0] || undefined;
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        throw error;
      }
    }
    return undefined;
  }

  private async _readUnmergedFiles(
    repository: GitRepository,
    signal: AbortSignal,
  ): Promise<string[]> {
    try {
      const result = await repository.exec(['diff', '--name-only', '--diff-filter=U', '--'], {
        signal,
      });
      if (result.exitCode === 0) {
        return result.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        throw error;
      }
    }
    return [];
  }

  private async _resolveGitPath(
    repository: GitRepository,
    gitPath: string,
    signal: AbortSignal,
  ): Promise<string> {
    const result = await repository.exec(['rev-parse', '--git-path', gitPath], { signal });
    const resolvedPath =
      result.stdout.trim().split('\n')[0] || path.join(repository.rootPath, '.git', gitPath);
    return path.isAbsolute(resolvedPath)
      ? resolvedPath
      : path.resolve(repository.rootPath, resolvedPath);
  }

  private async _readGitStateFile(
    statePath: string,
    fileName: string,
  ): Promise<string | undefined> {
    try {
      return (
        (await fs.promises.readFile(path.join(statePath, fileName), 'utf8')).trim() || undefined
      );
    } catch {
      return undefined;
    }
  }

  private async _createInteractiveRebaseSession(
    repository: GitRepository,
    entries: readonly RebasePlanEntry[],
    signal: AbortSignal,
  ): Promise<InteractiveRebaseSession> {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'git-graph-rebase-'));
    const stateDir = await this._resolveGitPath(repository, 'rebase-merge', signal);
    const messagesDir = path.join(tempDir, 'messages');
    await fs.promises.mkdir(messagesDir, { recursive: true });

    for (const entry of entries) {
      if (entry.action !== 'reword') {
        continue;
      }
      const message = entry.message?.trim() ? entry.message : entry.subject;
      const normalized = message.endsWith('\n') ? message : `${message}\n`;
      await fs.promises.writeFile(path.join(messagesDir, `${entry.sha}.txt`), normalized, 'utf8');
    }

    await fs.promises.writeFile(
      path.join(tempDir, 'todo'),
      RebasePlanQuery.formatTodo(entries),
      'utf8',
    );

    const sequenceEditorPath = path.join(tempDir, 'sequence-editor.cjs');
    await fs.promises.writeFile(sequenceEditorPath, this._sequenceEditorScript(), 'utf8');

    const messageEditorPath = path.join(tempDir, 'message-editor.cjs');
    await fs.promises.writeFile(
      messageEditorPath,
      this._messageEditorScript(stateDir, messagesDir),
      'utf8',
    );

    return { tempDir, sequenceEditorPath, messageEditorPath };
  }

  private _sequenceEditorScript(): string {
    return `const fs = require('fs');
const path = require('path');
const target = process.argv[2];
const base = __dirname;
const marker = path.join(base, 'sequence-applied');
try {
  if (fs.existsSync(marker)) {
    process.exit(0);
  }
  fs.copyFileSync(path.join(base, 'todo'), target);
  fs.writeFileSync(marker, '1');
  process.exit(0);
} catch (error) {
  process.stderr.write(String(error));
  process.exit(1);
}
`;
  }

  private _messageEditorScript(stateDir: string, messagesDir: string): string {
    return `const fs = require('fs');
const path = require('path');
const target = process.argv[2];
const config = ${JSON.stringify({ stateDir, messagesDir })};
if (!target) {
  process.exit(0);
}
let done = '';
try {
  done = fs.readFileSync(path.join(config.stateDir, 'done'), 'utf8');
} catch {
  process.exit(0);
}
const lines = done
  .split('\\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'));
const last = lines.length > 0 ? lines[lines.length - 1] : '';
const parts = last.split(/\\s+/);
const action = parts[0];
const sha = parts[1];
if (action === 'reword' && sha) {
  const messagePath = path.join(config.messagesDir, sha + '.txt');
  if (fs.existsSync(messagePath)) {
    fs.writeFileSync(target, fs.readFileSync(messagePath, 'utf8'));
  }
}
process.exit(0);
`;
  }

  private _interactiveRebaseEnv(session: InteractiveRebaseSession): Record<string, string> {
    const execPath = process.execPath;
    return {
      GIT_SEQUENCE_EDITOR: `"${execPath}" "${session.sequenceEditorPath}"`,
      GIT_EDITOR: `"${execPath}" "${session.messageEditorPath}"`,
      GIT_TERMINAL_PROMPT: '0',
      ELECTRON_RUN_AS_NODE: '1',
    };
  }

  private _cleanupInteractiveRebaseSession(repositoryId: string): void {
    const session = this._interactiveRebaseSessions.get(repositoryId);
    if (!session) {
      return;
    }
    this._interactiveRebaseSessions.delete(repositoryId);
    void fs.promises.rm(session.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }

  private async _execGit(
    context: OperationContext,
    args: readonly string[],
    options?: { env?: Record<string, string | undefined> },
  ): Promise<GitResult> {
    context.logCommand('git', args);
    const result = await context.repository.exec(args, {
      signal: context.signal,
      ...(options?.env ? { env: options.env } : {}),
    });
    if (result.exitCode !== 0) {
      throw new GitCommandError(result.stderr || `git ${args[0] ?? ''} failed`, {
        command: 'git',
        args,
        exitCode: result.exitCode,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
      });
    }
    return result;
  }

  private _normalizeLocalBranchName(target: string): string {
    return target.replace(/^refs\/heads\//, '');
  }

  private _normalizeRemoteBranchRef(target: string): string {
    const shortName = target.replace(/^refs\/remotes\//, '');
    const hasWhitespaceOrControlCharacter = Array.from(shortName).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return /\s/.test(character) || codePoint <= 31 || codePoint === 127;
    });
    if (!shortName || shortName.startsWith('-') || hasWhitespaceOrControlCharacter) {
      throw new AppError(
        AppErrorCode.GIT_COMMAND_FAILED,
        `'${target}' is not a valid remote branch.`,
      );
    }
    return `refs/remotes/${shortName}`;
  }

  private _shortRemoteBranchName(fullRef: string): string {
    return fullRef.replace(/^refs\/remotes\//, '');
  }

  private _normalizeRemoteName(rawName: string): string {
    const name = rawName.trim();
    if (!name || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name)) {
      throw new AppError(
        AppErrorCode.GIT_COMMAND_FAILED,
        `'${rawName}' is not a valid remote name.`,
      );
    }
    return name;
  }

  private async _readHeadSha(
    repository: GitRepository,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    try {
      const result = await repository.exec(['rev-parse', '--verify', 'HEAD'], { signal });
      if (result.exitCode !== 0) {
        return undefined;
      }
      const sha = result.stdout.trim();
      return sha || undefined;
    } catch {
      return undefined;
    }
  }

  private async _resolveExclusiveBranchCommits(
    repository: GitRepository,
    targetBranch: string,
    currentBranch: string,
    signal: AbortSignal,
  ): Promise<string[]> {
    try {
      // 1. Resolve targetBranch commit SHA
      const targetShaResult = await repository.exec(
        ['rev-parse', '--verify', `${targetBranch}^{commit}`],
        { signal },
      );
      if (targetShaResult.exitCode !== 0) {
        return [];
      }
      const targetSha = targetShaResult.stdout.trim().split('\n')[0];
      if (!targetSha) {
        return [];
      }

      // 2. Collect all other branch refs (both local refs/heads/ and remote refs/remotes/)
      const refResult = await repository.exec(
        ['for-each-ref', '--format=%(refname)', 'refs/heads/', 'refs/remotes/'],
        { signal },
      );
      const allRefLines =
        refResult.exitCode === 0
          ? refResult.stdout
              .split('\n')
              .map((r) => r.trim())
              .filter(Boolean)
          : [];

      // Filter out target branch itself and symbolic refs like HEAD
      const otherRefs = allRefLines.filter((ref) => {
        if (ref.endsWith('/HEAD')) return false;
        const shortName = ref.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\//, '');
        const targetClean = targetBranch
          .replace(/^refs\/heads\//, '')
          .replace(/^refs\/remotes\//, '');
        return shortName !== targetClean && ref !== `refs/heads/${targetClean}`;
      });

      // 3. Find the closest ancestor ref to targetSha (smallest non-zero distance)
      let closestBaseSha: string | undefined;
      let minDistance = Infinity;

      for (const ref of otherRefs) {
        const mbResult = await repository.exec(['merge-base', targetSha, ref], { signal });
        if (mbResult.exitCode === 0) {
          const mbSha = mbResult.stdout.trim().split('\n')[0];
          if (mbSha && mbSha !== targetSha) {
            const countResult = await repository.exec(
              ['rev-list', '--count', `${mbSha}..${targetSha}`],
              { signal },
            );
            if (countResult.exitCode === 0) {
              const distance = parseInt(countResult.stdout.trim(), 10);
              if (!isNaN(distance) && distance > 0 && distance < minDistance) {
                minDistance = distance;
                closestBaseSha = mbSha;
              }
            }
          }
        }
      }

      // 4. If closest ancestor found, get the commits between closestBaseSha and targetSha
      if (closestBaseSha) {
        const revListResult = await repository.exec(
          ['rev-list', '--no-merges', `${closestBaseSha}..${targetSha}`, '--reverse'],
          { signal },
        );
        if (revListResult.exitCode === 0) {
          const commits = revListResult.stdout
            .split('\n')
            .map((c) => c.trim())
            .filter(Boolean);
          if (commits.length > 0) {
            return commits;
          }
        }
      }

      // Fallback relative to currentBranch
      const fallbackResult = await repository.exec(
        ['rev-list', '--no-merges', `${currentBranch}..${targetSha}`, '--reverse'],
        { signal },
      );
      if (fallbackResult.exitCode === 0) {
        const commits = fallbackResult.stdout
          .split('\n')
          .map((c) => c.trim())
          .filter(Boolean);
        if (commits.length > 0) {
          return commits;
        }
      }

      // Fallback: single target commit
      return [targetSha];
    } catch {
      return [];
    }
  }

  /**
   * Requests cancellation of a queued or active operation.
   */
  public cancelOperation(operationId: string): boolean {
    return this._queue.cancelOperation(operationId);
  }

  public dispose(): void {
    while (this._disposables.length) {
      const d = this._disposables.pop();
      d?.dispose();
    }
  }
}
