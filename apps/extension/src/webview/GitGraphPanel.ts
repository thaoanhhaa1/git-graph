import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewHtml } from './getWebviewHtml';
import {
  createMessage,
  createErrorMessage,
  safeParseWebviewMessage,
  clampPageSize,
  DEFAULT_CHUNK_SIZE,
  measureSerialization,
  splitCommitPageIntoChunks,
  AppErrorCode,
  type AppBootstrapPayload,
  type RepositoryDescriptor,
  type RepositoryItem,
  type RepositoriesListResultPayload,
  type CommitsPageRequestPayload,
  type CommitsPageResultPayload,
  type CommitDetailsRequestPayload,
  type CommitDetailsResultPayload,
  type CommitDiffRequestPayload,
  type CommitDiffResultPayload,
  type DiffOpenRequestPayload,
  type FileOpenRevisionRequestPayload,
  type SearchRequestPayload,
  type SearchResultPayload,
  type WorktreeStatusRequestPayload,
  type WorktreeDiscardRequestPayload,
  type GitWorktreeListRequestPayload,
  type GitWorktreeOpenRequestPayload,
  type GitWorktreeListResultPayload,
  type SubmoduleListRequestPayload,
  type SubmoduleOpenRequestPayload,
  type SubmoduleListResultPayload,
  type StashListRequestPayload,
  type StashSaveRequestPayload,
  type StashActionRequestPayload,
  type WorktreeStatusResultPayload,
  type StashListResultPayload,
  type GraphInvalidatedPayload,
  type GraphRevealCommitPayload,
  type OperationCheckoutRequestPayload,
  type OperationCheckoutTargetType,
  type OperationBranchCreateRequestPayload,
  type OperationBranchRenameRequestPayload,
  type OperationBranchDeleteRequestPayload,
  type OperationPushRequestPayload,
  type OperationPullRequestPayload,
  type RemoteListRequestPayload,
  type RemoteAddRequestPayload,
  type RemoteRemoveRequestPayload,
  type RemoteRenameRequestPayload,
  type RemoteSetUrlRequestPayload,
  type ReflogRecentRequestPayload,
  type OperationUndoRequestPayload,
  type RepositorySyncStatusRequestPayload,
  type RemoteListResultPayload,
  type ReflogRecentResultPayload,
  type RepositorySyncStatusResultPayload,
  type UiDialogOpenPayload,
  type WebviewDialogKind,
  type OperationTagCreateRequestPayload,
  type OperationTagDeleteRequestPayload,
  type OperationMergeRequestPayload,
  type OperationMergeFastForwardMode,
  type OperationMergeAbortRequestPayload,
  type OperationRebaseRequestPayload,
  type OperationRebaseActionRequestPayload,
  type RebaseInteractivePlanRequestPayload,
  type RebaseInteractiveStartRequestPayload,
  type RebaseInteractiveActionRequestPayload,
  type RebaseInteractivePlanResultPayload,
  type OperationCherryPickRequestPayload,
  type OperationRevertRequestPayload,
  type OperationSequencerActionRequestPayload,
  type OperationResetRequestPayload,
  type OperationFetchRequestPayload,
  type OperationProgressPayload,
  type OperationResultPayload,
  type Commit,
  type CommitPage,
  type CommitOrdering,
  type FilterPathSetPayload,
  type ViewConfigUpdatePayload,
  ViewConfigUpdatePayloadSchema,
} from '@git-graph/shared';
import { GitRepository } from '@git-graph/git-core';
import { RepositoryManager } from '../repositories/RepositoryManager';
import { RefreshCoordinator } from '../application/RefreshCoordinator';
import { syncAndRefreshGit } from '../application/vsCodeGitRefresh';
import { CommitDetailsController } from '../application/CommitDetailsController';
import { RepositoryWatcher } from '../watchers/RepositoryWatcher';
import { GitRevisionContentProvider } from './GitRevisionContentProvider';
import { GitOperationService } from '../operations/GitOperationService';
import { OperationPreflight } from '../operations/OperationPreflight';
import { t } from '../i18n/l10n';
import { isE2EEnabled, recordPostedMessage } from '../e2e/e2eBridge';

/**
 * Manages the Git Graph Webview panel.
 * Ensures a single panel exists per VS Code window and cleanly manages event listeners and resources.
 */
export class GitGraphPanel implements vscode.Disposable {
  public static currentPanel: GitGraphPanel | undefined;
  public static readonly viewType = 'gitGraph.view';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _repositoryManager: RepositoryManager;
  private readonly _refreshCoordinator: RefreshCoordinator;
  private readonly _repositoryWatcher: RepositoryWatcher;
  private readonly _commitDetailsController: CommitDetailsController;
  private readonly _gitOperationService: GitOperationService;
  private readonly _inFlightCommitsAbortControllers = new Map<string, AbortController>();
  private _disposables: vscode.Disposable[] = [];
  private _isDisposed = false;
  private _webviewReady = false;
  private _pendingDialog?: WebviewDialogKind;
  private _pendingReveal?: GraphRevealCommitPayload;

  /**
   * Creates or reveals the single Git Graph webview panel.
   */
  public static createOrShow(
    extensionUri: vscode.Uri,
    repositoryManager?: RepositoryManager,
    refreshCoordinator?: RefreshCoordinator,
    repositoryWatcher?: RepositoryWatcher,
    commitDetailsController?: CommitDetailsController,
    gitOperationService?: GitOperationService,
  ): GitGraphPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If an existing panel exists, reveal it in the requested column.
    if (GitGraphPanel.currentPanel) {
      GitGraphPanel.currentPanel._panel.reveal(column);
      return GitGraphPanel.currentPanel;
    }

    // Otherwise, create a new Webview panel.
    const panel = vscode.window.createWebviewPanel(
      GitGraphPanel.viewType,
      'Git Graph',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: GitGraphPanel.getLocalResourceRoots(extensionUri),
      },
    );

    GitGraphPanel.currentPanel = new GitGraphPanel(
      panel,
      extensionUri,
      repositoryManager,
      refreshCoordinator,
      repositoryWatcher,
      commitDetailsController,
      gitOperationService,
    );
    return GitGraphPanel.currentPanel;
  }

  /**
   * Revives a deserialized webview panel (e.g. after window reload).
   */
  public static revive(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    repositoryManager?: RepositoryManager,
    refreshCoordinator?: RefreshCoordinator,
    repositoryWatcher?: RepositoryWatcher,
    commitDetailsController?: CommitDetailsController,
    gitOperationService?: GitOperationService,
  ): GitGraphPanel {
    if (GitGraphPanel.currentPanel) {
      GitGraphPanel.currentPanel.dispose();
    }

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: GitGraphPanel.getLocalResourceRoots(extensionUri),
    };

    GitGraphPanel.currentPanel = new GitGraphPanel(
      panel,
      extensionUri,
      repositoryManager,
      refreshCoordinator,
      repositoryWatcher,
      commitDetailsController,
      gitOperationService,
    );
    return GitGraphPanel.currentPanel;
  }

  /**
   * Defines minimal local resource roots allowed for webview asset loading.
   */
  public static getLocalResourceRoots(extensionUri: vscode.Uri): vscode.Uri[] {
    return [
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview-ui'),
      vscode.Uri.joinPath(extensionUri, '..', 'webview', 'dist'),
      vscode.Uri.joinPath(extensionUri, 'media'),
    ];
  }

  public static getPanelIconPath(extensionUri: vscode.Uri): {
    readonly light: vscode.Uri;
    readonly dark: vscode.Uri;
  } {
    const iconUri = vscode.Uri.joinPath(extensionUri, 'resources', 'icon.svg');
    return {
      light: iconUri,
      dark: iconUri,
    };
  }

  public constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    repositoryManager?: RepositoryManager,
    refreshCoordinator?: RefreshCoordinator,
    repositoryWatcher?: RepositoryWatcher,
    commitDetailsController?: CommitDetailsController,
    gitOperationService?: GitOperationService,
  ) {
    this._panel = panel;
    this._panel.iconPath = GitGraphPanel.getPanelIconPath(extensionUri);
    this._extensionUri = extensionUri;

    if (isE2EEnabled()) {
      const originalPostMessage = this._panel.webview.postMessage.bind(this._panel.webview);
      this._panel.webview.postMessage = (message: unknown) => {
        recordPostedMessage(message);
        return originalPostMessage(message);
      };
    }
    this._repositoryManager = repositoryManager ?? new RepositoryManager();
    this._refreshCoordinator =
      refreshCoordinator ??
      new RefreshCoordinator({
        getActiveRepositoryId: () => this._repositoryManager.getActiveRepository()?.id,
      });
    this._repositoryWatcher = repositoryWatcher ?? new RepositoryWatcher();
    this._commitDetailsController =
      commitDetailsController ??
      new CommitDetailsController({
        repositoryManager: this._repositoryManager,
        refreshCoordinator: this._refreshCoordinator,
      });
    this._disposables.push(this._commitDetailsController);

    this._gitOperationService =
      gitOperationService ??
      new GitOperationService({
        repositoryManager: this._repositoryManager,
        refreshCoordinator: this._refreshCoordinator,
      });
    this._disposables.push(this._gitOperationService);

    // Register text document content provider for historical Git revisions
    if (vscode.workspace?.registerTextDocumentContentProvider) {
      const revisionContentProvider = new GitRevisionContentProvider(this._repositoryManager);
      this._disposables.push(
        vscode.workspace.registerTextDocumentContentProvider(
          GitRevisionContentProvider.SCHEME,
          revisionContentProvider,
        ),
      );
    }

    // Set initial webview content (renders loading skeleton + loads bundle)
    this._update();

    // Listen for panel disposal (user closed panel or panel.dispose() was called)
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Forward filesystem changes from watcher to refresh coordinator
    this._disposables.push(
      this._repositoryWatcher.onDidRepositoryChange((event) => {
        this._refreshCoordinator.handleRepositoryChange(event);
      }),
    );

    // Forward coordinator invalidations to Webview via graph.invalidated message
    this._disposables.push(
      this._refreshCoordinator.onDidInvalidate((event) => {
        const msg = createMessage<'graph.invalidated', GraphInvalidatedPayload>(
          'graph.invalidated',
          { repositoryId: event.repositoryId },
        );
        this._panel.webview.postMessage(msg);
      }),
    );

    // Forward operation progress to Webview
    this._disposables.push(
      this._gitOperationService.onDidProgress((event) => {
        const msg = createMessage<'operation.progress', OperationProgressPayload>(
          'operation.progress',
          event,
          { requestId: event.requestId },
        );
        this._panel.webview.postMessage(msg);
      }),
    );

    // Forward operation result to Webview
    this._disposables.push(
      this._gitOperationService.onDidResult((event) => {
        const msg = createMessage<'operation.result', OperationResultPayload>(
          'operation.result',
          event,
          { requestId: event.requestId },
        );
        this._panel.webview.postMessage(msg);
      }),
    );

    // Keep the webview settings panel in sync with VS Code settings.json changes (M18.3)
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration('gitGraph') || !this._webviewReady) {
          return;
        }
        const msg = createMessage<'view.config.changed', ViewConfigUpdatePayload>(
          'view.config.changed',
          this._readViewConfig(),
        );
        this._panel.webview.postMessage(msg);
      }),
    );

    // Listen for repository changes: update watcher & push update to webview
    this._disposables.push(
      this._repositoryManager.onDidChangeRepositories((repositories) => {
        this._repositoryWatcher.setWatchedRepositories(repositories);
        this.sendRepositoriesList(repositories);
      }),
    );

    // Start watching existing repositories if already discovered
    if (this._repositoryManager.isDiscovered) {
      this._repositoryWatcher.setWatchedRepositories(this._repositoryManager.getRepositories());
    }

    // Listen for view state changes
    this._panel.onDidChangeViewState(
      () => {
        if (this._panel.visible) {
          // Panel became visible again
        }
      },
      null,
      this._disposables,
    );

    // Listen for messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        void this._handleMessage(message).catch((err: unknown) => {
          this._postErrorToWebview('Git Graph request failed', err);
        });
      },
      null,
      this._disposables,
    );
  }

  public get panel(): vscode.WebviewPanel {
    return this._panel;
  }

  public get repositoryManager(): RepositoryManager {
    return this._repositoryManager;
  }

  public get refreshCoordinator(): RefreshCoordinator {
    return this._refreshCoordinator;
  }

  public get repositoryWatcher(): RepositoryWatcher {
    return this._repositoryWatcher;
  }

  public get gitOperationService(): GitOperationService {
    return this._gitOperationService;
  }

  public get disposablesCount(): number {
    return this._disposables.length;
  }

  public showDialog(dialog: WebviewDialogKind): void {
    if (this._isDisposed) {
      return;
    }
    if (!this._webviewReady) {
      this._pendingDialog = dialog;
      return;
    }
    this._panel.webview.postMessage(
      createMessage<'ui.dialog.open', UiDialogOpenPayload>('ui.dialog.open', { dialog }),
    );
  }

  /**
   * Reveals a commit in the graph, queueing the request until the webview is ready.
   */
  public revealCommit(sha: string, repositoryId?: string): void {
    if (this._isDisposed) {
      return;
    }

    const payload: GraphRevealCommitPayload = repositoryId ? { sha, repositoryId } : { sha };

    if (!this._webviewReady) {
      this._pendingReveal = payload;
      return;
    }

    this._panel.webview.postMessage(
      createMessage<'graph.reveal.commit', GraphRevealCommitPayload>(
        'graph.reveal.commit',
        payload,
      ),
    );
  }

  private _update(): void {
    this._panel.webview.html = getWebviewHtml(this._panel.webview, this._extensionUri);
  }

  private _postErrorToWebview(prefix: string, err: unknown, requestId?: string): void {
    if (this._isDisposed) {
      return;
    }
    const errorMessage = err instanceof Error ? err.message : String(err);
    this._panel.webview.postMessage(
      createErrorMessage(
        `${prefix}: ${errorMessage}`,
        AppErrorCode.UNKNOWN_ERROR,
        undefined,
        requestId,
      ),
    );
  }

  private async _resolveRepository(repositoryId: string): Promise<GitRepository | undefined> {
    let gitRepo = this._repositoryManager.getRepository(repositoryId);
    if (gitRepo) {
      return gitRepo;
    }

    if (!this._repositoryManager.isDiscovered) {
      await this._repositoryManager.discoverRepositories();
      gitRepo = this._repositoryManager.getRepository(repositoryId);
      if (gitRepo) {
        return gitRepo;
      }
    }

    const repos = this._repositoryManager.getRepositories();
    if (repos.length > 0) {
      const matchIndex = /^repo-(\d+)$/.exec(repositoryId);
      if (matchIndex && matchIndex[1]) {
        const idx = parseInt(matchIndex[1], 10);
        const target = repos[idx];
        if (target) {
          return this._repositoryManager.getRepository(target.id);
        }
      }
      const first = repos[0];
      if (repositoryId === 'repo-workspace' && first) {
        return this._repositoryManager.getRepository(first.id);
      }
      const active = this._repositoryManager.getActiveRepository();
      if (active) {
        return this._repositoryManager.getRepository(active.id);
      }
      if (first) {
        return this._repositoryManager.getRepository(first.id);
      }
    }

    return undefined;
  }

  private _postRepositoryUnavailable(repositoryId: string, requestId?: string): void {
    this._panel.webview.postMessage(
      createErrorMessage(
        `Repository is no longer available: ${repositoryId}`,
        AppErrorCode.NOT_A_REPOSITORY,
        { repositoryId },
        requestId,
      ),
    );
    void this._repositoryManager.refresh();
  }

  /**
   * Test-only entry point used by the real-host E2E harness to simulate a
   * message coming from the webview. Only active when GIT_GRAPH_E2E=1.
   */
  public async handleWebviewMessageForTesting(message: unknown): Promise<void> {
    if (!isE2EEnabled()) {
      return;
    }
    await this._handleMessage(message);
  }

  private async _handleMessage(message: unknown): Promise<void> {
    const parseResult = safeParseWebviewMessage(message);
    if (!parseResult.success) {
      console.warn(
        '[GitGraphPanel] Rejected invalid message from webview:',
        parseResult.error.message,
        parseResult.error.details,
      );
      return;
    }

    const envelope = parseResult.data;
    switch (envelope.type) {
      case 'app.ready':
        this._webviewReady = true;
        this.sendBootstrap();
        if (this._pendingDialog) {
          const dialog = this._pendingDialog;
          this._pendingDialog = undefined;
          this.showDialog(dialog);
        }
        if (this._pendingReveal) {
          const reveal = this._pendingReveal;
          this._pendingReveal = undefined;
          this.revealCommit(reveal.sha, reveal.repositoryId);
        }
        break;
      case 'repositories.list.request':
        if (envelope.payload?.refresh) {
          await this._repositoryManager.refresh();
        } else if (!this._repositoryManager.isDiscovered) {
          await this._repositoryManager.discoverRepositories();
        }
        this.sendRepositoriesList(this._repositoryManager.getRepositories(), envelope.id);
        break;
      case 'repository.select': {
        const prevActive = this._repositoryManager.getActiveRepository();
        if (prevActive && prevActive.id !== envelope.payload.repositoryId) {
          const existingController = this._inFlightCommitsAbortControllers.get(prevActive.id);
          if (existingController) {
            existingController.abort();
            this._inFlightCommitsAbortControllers.delete(prevActive.id);
          }
        }
        this._repositoryManager.setActiveRepository(envelope.payload.repositoryId);
        break;
      }
      case 'graph.refresh.request': {
        const repoId = envelope.payload?.repositoryId;
        const targetRepo = repoId
          ? this._repositoryManager.getRepository(repoId)
          : this._repositoryManager.getActiveGitRepository();
        await syncAndRefreshGit(targetRepo);

        this._refreshCoordinator.requestRefresh(repoId, {
          hard: envelope.payload?.hard,
        });
        if (envelope.payload?.hard) {
          await this._repositoryManager.refresh();
          this.sendBootstrap();
        } else {
          await this._repositoryManager.refresh();
        }
        break;
      }
      case 'commits.page.request':
        await this._handleCommitsPageRequest(envelope.payload, envelope.id);
        break;
      case 'commit.details.request':
        await this._handleCommitDetailsRequest(envelope.payload, envelope.id);
        break;
      case 'commit.diff.request':
        await this._handleCommitDiffRequest(envelope.payload, envelope.id);
        break;
      case 'diff.open.request':
        await this._handleDiffOpenRequest(envelope.payload);
        break;
      case 'file.openRevision.request':
        await this._handleOpenFileRevisionRequest(envelope.payload);
        break;
      case 'worktree.status.request':
        await this._handleWorktreeStatusRequest(envelope.payload, envelope.id);
        break;
      case 'worktree.stage.request':
        await this._gitOperationService.stageWorktree({
          operationId: envelope.id,
          repositoryId: envelope.payload.repositoryId,
          paths: envelope.payload.paths,
          all: envelope.payload.all,
        });
        break;
      case 'worktree.unstage.request':
        await this._gitOperationService.unstageWorktree({
          operationId: envelope.id,
          repositoryId: envelope.payload.repositoryId,
          paths: envelope.payload.paths,
          all: envelope.payload.all,
        });
        break;
      case 'worktree.discard.request':
        await this._handleWorktreeDiscardRequest(envelope.payload, envelope.id);
        break;
      case 'worktree.list.request':
        await this._handleGitWorktreeListRequest(envelope.payload, envelope.id);
        break;
      case 'worktree.add.request':
        await this._gitOperationService.addGitWorktree({
          operationId: envelope.id,
          repositoryId: envelope.payload.repositoryId,
          path: envelope.payload.path,
          branch: envelope.payload.branch,
          newBranch: envelope.payload.newBranch,
        });
        break;
      case 'worktree.remove.request':
        await this._gitOperationService.removeGitWorktree({
          operationId: envelope.id,
          repositoryId: envelope.payload.repositoryId,
          path: envelope.payload.path,
          force: envelope.payload.force,
        });
        break;
      case 'worktree.open.request':
        await this._handleGitWorktreeOpenRequest(envelope.payload);
        break;
      case 'submodule.list.request':
        await this._handleSubmoduleListRequest(envelope.payload, envelope.id);
        break;
      case 'submodule.open.request':
        await this._handleSubmoduleOpenRequest(envelope.payload);
        break;
      case 'operation.commit.create.request':
        await this._gitOperationService.createCommit({
          operationId: envelope.id,
          repositoryId: envelope.payload.repositoryId,
          message: envelope.payload.message,
          description: envelope.payload.description,
          amend: envelope.payload.amend,
        });
        break;
      case 'stash.list.request':
        await this._handleStashListRequest(envelope.payload, envelope.id);
        break;
      case 'stash.save.request':
        await this._handleStashSaveRequest(envelope.payload, envelope.id);
        break;
      case 'stash.pop.request':
        await this._gitOperationService.popStash({
          operationId: envelope.id,
          repositoryId: envelope.payload.repositoryId,
          index: envelope.payload.index,
        });
        break;
      case 'stash.apply.request':
        await this._gitOperationService.applyStash({
          operationId: envelope.id,
          repositoryId: envelope.payload.repositoryId,
          index: envelope.payload.index,
        });
        break;
      case 'stash.drop.request':
        await this._handleStashDropRequest(envelope.payload, envelope.id);
        break;
      case 'search.request':
        await this._handleSearchRequest(envelope.payload, envelope.id);
        break;
      case 'operation.checkout.request':
        await this._handleCheckoutRequest(envelope.payload, envelope.id);
        break;
      case 'operation.branch.create.request':
        await this._handleCreateBranchRequest(envelope.payload, envelope.id);
        break;
      case 'operation.branch.rename.request':
        await this._handleRenameBranchRequest(envelope.payload, envelope.id);
        break;
      case 'operation.branch.delete.request':
        await this._handleDeleteBranchRequest(envelope.payload, envelope.id);
        break;
      case 'operation.push.request':
        await this._handlePushRequest(envelope.payload, envelope.id);
        break;
      case 'operation.pull.request':
        await this._handlePullRequest(envelope.payload, envelope.id);
        break;
      case 'remote.list.request':
        await this._handleRemoteListRequest(envelope.payload, envelope.id);
        break;
      case 'remote.add.request':
        await this._handleRemoteAddRequest(envelope.payload, envelope.id);
        break;
      case 'remote.remove.request':
        await this._handleRemoteRemoveRequest(envelope.payload, envelope.id);
        break;
      case 'remote.rename.request':
        await this._handleRemoteRenameRequest(envelope.payload, envelope.id);
        break;
      case 'remote.setUrl.request':
        await this._handleRemoteSetUrlRequest(envelope.payload, envelope.id);
        break;
      case 'reflog.recent.request':
        await this._handleReflogRecentRequest(envelope.payload, envelope.id);
        break;
      case 'operation.undo.request':
        await this._handleUndoRequest(envelope.payload, envelope.id);
        break;
      case 'repository.syncStatus.request':
        await this._handleSyncStatusRequest(envelope.payload, envelope.id);
        break;
      case 'operation.tag.create.request':
        await this._handleCreateTagRequest(envelope.payload, envelope.id);
        break;
      case 'operation.tag.delete.request':
        await this._handleDeleteTagRequest(envelope.payload, envelope.id);
        break;
      case 'operation.merge.request':
        await this._handleMergeRequest(envelope.payload, envelope.id);
        break;
      case 'operation.merge.abort.request':
        await this._handleMergeAbortRequest(envelope.payload, envelope.id);
        break;
      case 'operation.rebase.request':
        await this._handleRebaseRequest(envelope.payload, envelope.id);
        break;
      case 'operation.rebase.continue.request':
        await this._handleRebaseContinueRequest(envelope.payload, envelope.id);
        break;
      case 'operation.rebase.abort.request':
        await this._handleRebaseAbortRequest(envelope.payload, envelope.id);
        break;
      case 'operation.rebase.skip.request':
        await this._handleRebaseSkipRequest(envelope.payload, envelope.id);
        break;
      case 'rebase.interactive.plan.request':
        await this._handleInteractiveRebasePlanRequest(envelope.payload, envelope.id);
        break;
      case 'rebase.interactive.start.request':
        await this._handleInteractiveRebaseStartRequest(envelope.payload, envelope.id);
        break;
      case 'rebase.interactive.continue':
        await this._handleRebaseContinueRequest(envelope.payload, envelope.id);
        break;
      case 'rebase.interactive.abort':
        await this._handleInteractiveRebaseAbortRequest(envelope.payload, envelope.id);
        break;
      case 'rebase.interactive.skip':
        await this._handleInteractiveRebaseSkipRequest(envelope.payload, envelope.id);
        break;
      case 'operation.cherryPick.request':
        await this._handleCherryPickRequest(envelope.payload, envelope.id);
        break;
      case 'operation.cherryPick.continue.request':
        await this._handleCherryPickContinueRequest(envelope.payload, envelope.id);
        break;
      case 'operation.cherryPick.abort.request':
        await this._handleCherryPickAbortRequest(envelope.payload, envelope.id);
        break;
      case 'operation.cherryPick.skip.request':
        await this._handleCherryPickSkipRequest(envelope.payload, envelope.id);
        break;
      case 'operation.revert.request':
        await this._handleRevertRequest(envelope.payload, envelope.id);
        break;
      case 'operation.revert.continue.request':
        await this._handleRevertContinueRequest(envelope.payload, envelope.id);
        break;
      case 'operation.revert.abort.request':
        await this._handleRevertAbortRequest(envelope.payload, envelope.id);
        break;
      case 'operation.revert.skip.request':
        await this._handleRevertSkipRequest(envelope.payload, envelope.id);
        break;
      case 'operation.reset.request':
        await this._handleResetRequest(envelope.payload, envelope.id);
        break;
      case 'operation.fetch.request':
        await this._handleFetchRequest(envelope.payload, envelope.id);
        break;
      case 'operation.cancel.request':
        this._gitOperationService.cancelOperation(envelope.payload.requestId);
        break;
      case 'view.config.update': {
        const validated = ViewConfigUpdatePayloadSchema.safeParse(envelope.payload);
        if (validated.success) {
          await this._applyViewConfigUpdate(validated.data);
        }
        break;
      }
      default:
        break;
    }
  }

  private _readViewConfig(): ViewConfigUpdatePayload {
    const extensionConfig = vscode.workspace.getConfiguration('gitGraph');
    return {
      showAuthor: extensionConfig.get<boolean>('showAuthor', true),
      showDate: extensionConfig.get<boolean>('showDate', true),
      showRemoteBranches: extensionConfig.get<boolean>('showRemoteBranches', true),
      showTags: extensionConfig.get<boolean>('showTags', true),
      dateType: extensionConfig.get<'relative' | 'absolute' | 'default'>('dateType', 'relative'),
      pageSize: extensionConfig.get<number>('pageSize', 500),
      commitOrdering: extensionConfig.get<CommitOrdering>('commitOrdering', 'date-order'),
      compactMode: extensionConfig.get<boolean>('compactMode', false),
      showMinimap: extensionConfig.get<boolean>('showMinimap', true),
      showStatusBarItem: extensionConfig.get<boolean>('showStatusBarItem', true),
      blameEnabled: extensionConfig.get<boolean>('blame.enabled', false),
      blameFormat: extensionConfig.get<string>(
        'blame.format',
        '${author}, ${relativeDate} • ${subject}',
      ),
    };
  }

  private async _applyViewConfigUpdate(update: ViewConfigUpdatePayload): Promise<void> {
    const extensionConfig = vscode.workspace.getConfiguration('gitGraph');
    const entries: Array<[string, unknown]> = [];

    if (update.commitOrdering !== undefined) {
      entries.push(['commitOrdering', update.commitOrdering]);
    }
    if (update.pageSize !== undefined) {
      entries.push(['pageSize', update.pageSize]);
    }
    if (update.showAuthor !== undefined) {
      entries.push(['showAuthor', update.showAuthor]);
    }
    if (update.showDate !== undefined) {
      entries.push(['showDate', update.showDate]);
    }
    if (update.showRemoteBranches !== undefined) {
      entries.push(['showRemoteBranches', update.showRemoteBranches]);
    }
    if (update.showTags !== undefined) {
      entries.push(['showTags', update.showTags]);
    }
    if (update.dateType !== undefined) {
      entries.push(['dateType', update.dateType]);
    }
    if (update.compactMode !== undefined) {
      entries.push(['compactMode', update.compactMode]);
    }
    if (update.showMinimap !== undefined) {
      entries.push(['showMinimap', update.showMinimap]);
    }
    if (update.showStatusBarItem !== undefined) {
      entries.push(['showStatusBarItem', update.showStatusBarItem]);
    }
    if (update.blameEnabled !== undefined) {
      entries.push(['blame.enabled', update.blameEnabled]);
    }
    if (update.blameFormat !== undefined) {
      entries.push(['blame.format', update.blameFormat]);
    }

    for (const [key, value] of entries) {
      await extensionConfig.update(key, value, vscode.ConfigurationTarget.Global);
    }
  }

  private async _handleCheckoutRequest(
    payload: OperationCheckoutRequestPayload,
    operationId: string,
  ): Promise<void> {
    const targetType: OperationCheckoutTargetType =
      payload.targetType ?? (payload.isBranch ? 'localBranch' : 'commit');
    let localBranchName = payload.localBranchName;
    let confirmedDetachedHead = Boolean(payload.noConfirm);
    let confirmedRemoteTracking = Boolean(payload.noConfirm);

    if (targetType === 'remoteBranch') {
      if (payload.noConfirm) {
        localBranchName = localBranchName ?? this._suggestLocalBranchName(payload.target);
        confirmedRemoteTracking = true;
      } else {
        localBranchName = await vscode.window.showInputBox({
          title: 'Checkout Remote Branch',
          prompt: 'Confirm the name of the new local tracking branch.',
          value: localBranchName ?? this._suggestLocalBranchName(payload.target),
          validateInput: (value) => (value.trim() ? undefined : 'Branch name is required.'),
        });
        if (!localBranchName) {
          return;
        }
        confirmedRemoteTracking = true;
      }
    }

    if ((targetType === 'tag' || targetType === 'commit') && !payload.noConfirm) {
      const confirmation = await vscode.window.showWarningMessage(
        `Checking out ${targetType} '${payload.target}' will detach HEAD. Create a branch to keep any new commits.`,
        { modal: true },
        'Checkout Detached',
      );
      if (confirmation !== 'Checkout Detached') {
        return;
      }
      confirmedDetachedHead = true;
    }

    await this._gitOperationService.checkout({
      operationId,
      repositoryId: payload.repositoryId,
      target: payload.target,
      targetType,
      ...(targetType === 'remoteBranch' ? { localBranchName, confirmedRemoteTracking } : {}),
      ...(targetType === 'tag' || targetType === 'commit' ? { confirmedDetachedHead } : {}),
    });
  }

  private _suggestLocalBranchName(remoteTarget: string): string {
    const shortName = remoteTarget.replace(/^refs\/remotes\//, '');
    const separatorIndex = shortName.indexOf('/');
    return separatorIndex >= 0 ? shortName.slice(separatorIndex + 1) : shortName;
  }

  private async _handleCreateBranchRequest(
    payload: OperationBranchCreateRequestPayload,
    operationId: string,
  ): Promise<void> {
    const name =
      payload.name?.trim() ||
      (await vscode.window.showInputBox({
        title: 'Create Branch',
        prompt: `Enter a branch name for start point '${payload.startPoint ?? 'HEAD'}'.`,
        validateInput: (value) => (value.trim() ? undefined : 'Branch name is required.'),
      }));
    if (!name) {
      return;
    }

    let checkout = payload.checkout;
    if (checkout === undefined) {
      const action = await vscode.window.showInformationMessage(
        `Create branch '${name.trim()}'${payload.startPoint ? ` from '${payload.startPoint}'` : ''}.`,
        { modal: true },
        'Create and Checkout',
        'Create Only',
      );
      if (!action) {
        return;
      }
      checkout = action === 'Create and Checkout';
    }

    await this._gitOperationService.createBranch({
      operationId,
      repositoryId: payload.repositoryId,
      name: name.trim(),
      ...(payload.startPoint ? { startPoint: payload.startPoint } : {}),
      checkout,
    });
  }

  private async _handleRenameBranchRequest(
    payload: OperationBranchRenameRequestPayload,
    operationId: string,
  ): Promise<void> {
    const oldName = payload.oldName.trim();
    const newName = payload.newName.trim();
    if (!oldName || !newName) {
      return;
    }

    await this._gitOperationService.renameBranch({
      operationId,
      repositoryId: payload.repositoryId,
      oldName,
      newName,
      syncRemote: payload.syncRemote,
      remote: payload.remote,
    });
  }

  private async _handleDeleteBranchRequest(
    payload: OperationBranchDeleteRequestPayload,
    operationId: string,
  ): Promise<void> {
    const branchName = payload.branchName.trim();
    if (!branchName) {
      return;
    }

    await this._gitOperationService.deleteBranch({
      operationId,
      repositoryId: payload.repositoryId,
      branchName,
      forceDelete: payload.forceDelete,
      deleteOnRemote: payload.deleteOnRemote,
      remote: payload.remote,
    });
  }

  private async _handlePushRequest(
    payload: OperationPushRequestPayload,
    operationId: string,
  ): Promise<void> {
    await this._gitOperationService.pushBranch({
      operationId,
      repositoryId: payload.repositoryId,
      branchName: payload.branchName,
      remote: payload.remote,
      setUpstream: payload.setUpstream,
      force: payload.force,
      ...(payload.forceWithLease !== undefined ? { forceWithLease: payload.forceWithLease } : {}),
      ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
    });
  }

  private async _handlePullRequest(
    payload: OperationPullRequestPayload,
    operationId: string,
  ): Promise<void> {
    await this._gitOperationService.pull({
      operationId,
      repositoryId: payload.repositoryId,
      remote: payload.remote,
      branch: payload.branch,
      strategy: payload.strategy,
      autostash: payload.autostash,
    });
  }

  private async _handleRemoteListRequest(
    payload: RemoteListRequestPayload,
    requestId?: string,
  ): Promise<void> {
    const gitRepo = await this._resolveRepository(payload.repositoryId);
    if (!gitRepo) {
      this._postRepositoryUnavailable(payload.repositoryId, requestId);
      return;
    }

    const result = await gitRepo.getRemoteDetails();
    const message = createMessage<'remote.list.result', RemoteListResultPayload>(
      'remote.list.result',
      {
        requestId,
        repositoryId: payload.repositoryId,
        remotes: result,
      },
      requestId ? { requestId } : undefined,
    );
    await this._panel.webview.postMessage(message);
  }

  private async _handleRemoteAddRequest(
    payload: RemoteAddRequestPayload,
    operationId: string,
  ): Promise<void> {
    await this._gitOperationService.addRemote({
      operationId,
      repositoryId: payload.repositoryId,
      name: payload.name,
      url: payload.url,
    });
  }

  private async _handleRemoteRemoveRequest(
    payload: RemoteRemoveRequestPayload,
    operationId: string,
  ): Promise<void> {
    await this._gitOperationService.removeRemote({
      operationId,
      repositoryId: payload.repositoryId,
      name: payload.name,
    });
  }

  private async _handleRemoteRenameRequest(
    payload: RemoteRenameRequestPayload,
    operationId: string,
  ): Promise<void> {
    await this._gitOperationService.renameRemote({
      operationId,
      repositoryId: payload.repositoryId,
      oldName: payload.oldName,
      newName: payload.newName,
    });
  }

  private async _handleRemoteSetUrlRequest(
    payload: RemoteSetUrlRequestPayload,
    operationId: string,
  ): Promise<void> {
    await this._gitOperationService.setRemoteUrl({
      operationId,
      repositoryId: payload.repositoryId,
      name: payload.name,
      url: payload.url,
      push: payload.push,
    });
  }

  private async _handleReflogRecentRequest(
    payload: ReflogRecentRequestPayload,
    requestId?: string,
  ): Promise<void> {
    const entries = await this._gitOperationService.listReflog(
      payload.repositoryId,
      payload.limit ?? 20,
    );
    await this._panel.webview.postMessage(
      createMessage<'reflog.recent.result', ReflogRecentResultPayload>(
        'reflog.recent.result',
        {
          requestId,
          repositoryId: payload.repositoryId,
          entries,
        },
        requestId ? { requestId } : undefined,
      ),
    );
  }

  private async _handleUndoRequest(
    payload: OperationUndoRequestPayload,
    operationId: string,
  ): Promise<void> {
    const action = await vscode.window.showWarningMessage(
      `Undo the last operation${
        payload.expectedSha ? ` and reset to ${payload.expectedSha.slice(0, 7)}` : ''
      }? Uncommitted changes will be discarded.`,
      { modal: true },
      'Undo',
    );
    if (action !== 'Undo') {
      this._panel.webview.postMessage(
        createMessage<'operation.result', OperationResultPayload>(
          'operation.result',
          {
            requestId: operationId,
            success: false,
            error: {
              code: AppErrorCode.OPERATION_CANCELLED,
              message: 'Undo cancelled.',
            },
          },
          { requestId: operationId },
        ),
      );
      return;
    }

    await this._gitOperationService.undo({
      operationId,
      repositoryId: payload.repositoryId,
      reflogIndex: payload.reflogIndex,
      expectedSha: payload.expectedSha,
    });
  }

  private async _handleSyncStatusRequest(
    payload: RepositorySyncStatusRequestPayload,
    requestId?: string,
  ): Promise<void> {
    const status = await this._gitOperationService.getSyncStatus(payload.repositoryId);
    await this._panel.webview.postMessage(
      createMessage<'repository.syncStatus.result', RepositorySyncStatusResultPayload>(
        'repository.syncStatus.result',
        { requestId, status },
        requestId ? { requestId } : undefined,
      ),
    );
  }

  private async _handleCreateTagRequest(
    payload: OperationTagCreateRequestPayload,
    operationId: string,
  ): Promise<void> {
    const name =
      payload.name?.trim() ||
      (await vscode.window.showInputBox({
        title: 'Create Tag',
        prompt: `Enter a lightweight tag name for target '${payload.target}'.`,
        validateInput: (value) => (value.trim() ? undefined : 'Tag name is required.'),
      }));
    if (!name) {
      return;
    }

    await this._gitOperationService.createTag({
      operationId,
      repositoryId: payload.repositoryId,
      name: name.trim(),
      target: payload.target,
      tagType: payload.tagType,
      message: payload.message,
      pushToRemote: payload.pushToRemote,
      remote: payload.remote,
    });
  }

  private async _handleDeleteTagRequest(
    payload: OperationTagDeleteRequestPayload,
    operationId: string,
  ): Promise<void> {
    const tagName = payload.tagName.trim();
    if (!tagName) {
      return;
    }

    if (payload.deleteOnRemote && payload.remote === undefined) {
      const gitRepo = await this._resolveRepository(payload.repositoryId);
      const remotes = gitRepo ? await gitRepo.getRemotes() : [];
      if (remotes.length > 1) {
        const selected = await vscode.window.showQuickPick(remotes, {
          title: 'Delete Tag on Remote',
          placeHolder: 'Select the remote to delete the tag from.',
        });
        if (!selected) {
          return;
        }
        await this._gitOperationService.deleteTag({
          operationId,
          repositoryId: payload.repositoryId,
          tagName,
          deleteOnRemote: true,
          remote: selected,
        });
        return;
      }
    }

    await this._gitOperationService.deleteTag({
      operationId,
      repositoryId: payload.repositoryId,
      tagName,
      deleteOnRemote: payload.deleteOnRemote,
      remote: payload.remote,
    });
  }

  private async _handleMergeRequest(
    payload: OperationMergeRequestPayload,
    operationId: string,
  ): Promise<void> {
    if (payload.squash) {
      if (!payload.noConfirm) {
        const action = await vscode.window.showWarningMessage(
          payload.exclusive
            ? `Squash merge exclusive commits of '${payload.targetBranch || payload.target}' into the current branch? All changes will be staged without creating a commit.`
            : `Squash merge '${payload.target}' into the current branch? All changes will be staged without creating a commit.`,
          { modal: true },
          'Squash Merge',
        );
        if (action !== 'Squash Merge') {
          return;
        }
      }

      await this._gitOperationService.merge({
        operationId,
        repositoryId: payload.repositoryId,
        target: payload.target,
        squash: true,
        ...(payload.exclusive ? { exclusive: true } : {}),
        ...(payload.targetBranch ? { targetBranch: payload.targetBranch } : {}),
      });
      return;
    }

    let fastForwardMode: OperationMergeFastForwardMode | undefined = payload.fastForwardMode;

    if (!fastForwardMode) {
      const action = await vscode.window.showWarningMessage(
        `Merge '${payload.target}' into the current branch. Choose how fast-forward should be handled.`,
        { modal: true },
        'Fast-forward When Possible',
        'Create Merge Commit (--no-ff)',
        'Fast-forward Only (--ff-only)',
      );
      if (!action) {
        return;
      }
      fastForwardMode =
        action === 'Create Merge Commit (--no-ff)'
          ? 'no-ff'
          : action === 'Fast-forward Only (--ff-only)'
            ? 'ff-only'
            : 'ff';
    }

    await this._gitOperationService.merge({
      operationId,
      repositoryId: payload.repositoryId,
      target: payload.target,
      fastForwardMode,
      ...(payload.noCommit ? { noCommit: true } : {}),
    });
  }

  private async _handleMergeAbortRequest(
    payload: OperationMergeAbortRequestPayload,
    operationId: string,
  ): Promise<void> {
    const action = await vscode.window.showWarningMessage(
      'Abort the in-progress merge? Git will restore the branch to its pre-merge state when possible.',
      { modal: true },
      'Abort Merge',
    );
    if (action !== 'Abort Merge') {
      return;
    }

    await this._gitOperationService.abortMerge({
      operationId,
      repositoryId: payload.repositoryId,
    });
  }

  private async _handleRebaseRequest(
    payload: OperationRebaseRequestPayload,
    operationId: string,
  ): Promise<void> {
    let confirmedPublishedBranch = payload.confirmedPublishedBranch ?? false;

    if (!confirmedPublishedBranch && !payload.noConfirm) {
      const action = await vscode.window.showWarningMessage(
        `Rebase the current branch onto '${payload.target}'. If this branch was pushed/shared, history will be rewritten.`,
        { modal: true },
        'Rebase',
      );
      if (action !== 'Rebase') {
        return;
      }
      confirmedPublishedBranch = true;
    }

    await this._gitOperationService.rebase({
      operationId,
      repositoryId: payload.repositoryId,
      target: payload.target,
      confirmedPublishedBranch,
      ...(payload.ignoreDate ? { ignoreDate: true } : {}),
    });
  }

  private async _handleRebaseContinueRequest(
    payload: OperationRebaseActionRequestPayload,
    operationId: string,
  ): Promise<void> {
    await this._gitOperationService.continueRebase({
      operationId,
      repositoryId: payload.repositoryId,
    });
  }

  private async _handleRebaseAbortRequest(
    payload: OperationRebaseActionRequestPayload,
    operationId: string,
  ): Promise<void> {
    const action = await vscode.window.showWarningMessage(
      'Abort the in-progress rebase? Git will restore the branch to its pre-rebase state when possible.',
      { modal: true },
      'Abort Rebase',
    );
    if (action !== 'Abort Rebase') {
      return;
    }

    await this._gitOperationService.abortRebase({
      operationId,
      repositoryId: payload.repositoryId,
    });
  }

  private async _handleRebaseSkipRequest(
    payload: OperationRebaseActionRequestPayload,
    operationId: string,
  ): Promise<void> {
    const action = await vscode.window.showWarningMessage(
      'Skip the current patch in the in-progress rebase? The skipped commit changes will not be applied.',
      { modal: true },
      'Skip Patch',
    );
    if (action !== 'Skip Patch') {
      return;
    }

    await this._gitOperationService.skipRebase({
      operationId,
      repositoryId: payload.repositoryId,
    });
  }

  private async _handleInteractiveRebasePlanRequest(
    payload: RebaseInteractivePlanRequestPayload,
    requestId?: string,
  ): Promise<void> {
    let onto = payload.onto;
    let entries: RebaseInteractivePlanResultPayload['entries'] = [];
    let error: string | undefined;

    try {
      const repository = this._repositoryManager.getRepository(payload.repositoryId);
      if (!repository) {
        throw new Error(`Repository '${payload.repositoryId}' not found.`);
      }
      const resolved = await repository.exec([
        'rev-parse',
        '--verify',
        '--end-of-options',
        `${payload.onto}^{commit}`,
      ]);
      const resolvedSha = resolved.stdout.trim().split('\n')[0];
      if (resolved.exitCode !== 0 || !resolvedSha) {
        throw new Error(`'${payload.onto}' does not resolve to a commit.`);
      }
      onto = resolvedSha;
      entries = await repository.getRebasePlan(resolvedSha);
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : String(err);
    }

    await this._panel.webview.postMessage(
      createMessage<'rebase.interactive.plan.result', RebaseInteractivePlanResultPayload>(
        'rebase.interactive.plan.result',
        {
          requestId,
          repositoryId: payload.repositoryId,
          onto,
          entries,
          ...(error ? { error } : {}),
        },
        requestId ? { requestId } : undefined,
      ),
    );
  }

  private async _handleInteractiveRebaseStartRequest(
    payload: RebaseInteractiveStartRequestPayload,
    operationId: string,
  ): Promise<void> {
    if (!payload.onto) {
      throw new Error('Interactive rebase requires a target commit.');
    }

    await this._gitOperationService.interactiveRebase({
      operationId,
      repositoryId: payload.repositoryId,
      onto: payload.onto,
      plan: payload.plan,
      ...(payload.confirmedPublishedBranch ? { confirmedPublishedBranch: true } : {}),
    });
  }

  private async _handleInteractiveRebaseAbortRequest(
    payload: RebaseInteractiveActionRequestPayload,
    operationId: string,
  ): Promise<void> {
    await this._gitOperationService.abortRebase({
      operationId,
      repositoryId: payload.repositoryId,
    });
  }

  private async _handleInteractiveRebaseSkipRequest(
    payload: RebaseInteractiveActionRequestPayload,
    operationId: string,
  ): Promise<void> {
    await this._gitOperationService.skipRebase({
      operationId,
      repositoryId: payload.repositoryId,
    });
  }

  private async _handleCherryPickRequest(
    payload: OperationCherryPickRequestPayload,
    operationId: string,
  ): Promise<void> {
    let commit = payload.commit.trim();

    if (payload.promptRange) {
      const defaultRange = payload.targetBranch
        ? `main..${payload.targetBranch}`
        : commit.includes('..')
          ? commit
          : `${commit.slice(0, 7)}^..${commit.slice(0, 7)}`;
      const input = await vscode.window.showInputBox({
        title: 'Squash Commits into Current Branch (No Commit)',
        prompt: payload.targetBranch
          ? `Enter base branch (e.g. 'test-dev') or commit range (e.g. 'test-dev..${payload.targetBranch}') to squash as staged changes:`
          : 'Enter base branch or revision range (e.g. base..target or commit^..commit) to squash as staged changes:',
        value: defaultRange,
        validateInput: (value) =>
          value.trim() ? undefined : 'Base branch or revision range is required.',
      });
      if (!input || !input.trim()) {
        return;
      }
      const trimmed = input.trim();
      if (!trimmed.includes('..') && !trimmed.includes(' ') && payload.targetBranch) {
        commit = `${trimmed}..${payload.targetBranch}`;
      } else {
        commit = trimmed;
      }
    }

    const isRange = commit.includes('..') || commit.includes(' ');
    let mainlineParent: number | undefined | false = payload.mainlineParent;
    if (!isRange && !payload.noConfirm) {
      mainlineParent = await this._confirmSequencerStart(
        'Cherry-pick',
        commit,
        payload.mainlineParent,
      );
      if (mainlineParent === false) {
        return;
      }
    }

    await this._gitOperationService.cherryPick({
      operationId,
      repositoryId: payload.repositoryId,
      commit,
      ...(mainlineParent ? { mainlineParent } : {}),
      ...(payload.noCommit !== undefined ? { noCommit: payload.noCommit } : {}),
    });
  }

  private async _handleCherryPickContinueRequest(
    payload: OperationSequencerActionRequestPayload,
    operationId: string,
  ): Promise<void> {
    await this._gitOperationService.continueCherryPick({
      operationId,
      repositoryId: payload.repositoryId,
    });
  }

  private async _handleCherryPickAbortRequest(
    payload: OperationSequencerActionRequestPayload,
    operationId: string,
  ): Promise<void> {
    const action = await vscode.window.showWarningMessage(
      'Abort the in-progress cherry-pick? Git will restore the branch to its pre-cherry-pick state when possible.',
      { modal: true },
      'Abort Cherry-pick',
    );
    if (action !== 'Abort Cherry-pick') {
      return;
    }

    await this._gitOperationService.abortCherryPick({
      operationId,
      repositoryId: payload.repositoryId,
    });
  }

  private async _handleCherryPickSkipRequest(
    payload: OperationSequencerActionRequestPayload,
    operationId: string,
  ): Promise<void> {
    const action = await vscode.window.showWarningMessage(
      'Skip the current commit in the in-progress cherry-pick? The skipped commit changes will not be applied.',
      { modal: true },
      'Skip Commit',
    );
    if (action !== 'Skip Commit') {
      return;
    }

    await this._gitOperationService.skipCherryPick({
      operationId,
      repositoryId: payload.repositoryId,
    });
  }

  private async _handleRevertRequest(
    payload: OperationRevertRequestPayload,
    operationId: string,
  ): Promise<void> {
    let mainlineParent = payload.mainlineParent;
    if (!payload.noConfirm) {
      const confirmed = await this._confirmSequencerStart(
        'Revert',
        payload.commit,
        payload.mainlineParent,
      );
      if (confirmed === false) {
        return;
      }
      mainlineParent = confirmed;
    }

    await this._gitOperationService.revert({
      operationId,
      repositoryId: payload.repositoryId,
      commit: payload.commit,
      ...(mainlineParent ? { mainlineParent } : {}),
    });
  }

  private async _handleRevertContinueRequest(
    payload: OperationSequencerActionRequestPayload,
    operationId: string,
  ): Promise<void> {
    await this._gitOperationService.continueRevert({
      operationId,
      repositoryId: payload.repositoryId,
    });
  }

  private async _handleRevertAbortRequest(
    payload: OperationSequencerActionRequestPayload,
    operationId: string,
  ): Promise<void> {
    const action = await vscode.window.showWarningMessage(
      'Abort the in-progress revert? Git will restore the branch to its pre-revert state when possible.',
      { modal: true },
      'Abort Revert',
    );
    if (action !== 'Abort Revert') {
      return;
    }

    await this._gitOperationService.abortRevert({
      operationId,
      repositoryId: payload.repositoryId,
    });
  }

  private async _handleRevertSkipRequest(
    payload: OperationSequencerActionRequestPayload,
    operationId: string,
  ): Promise<void> {
    const action = await vscode.window.showWarningMessage(
      'Skip the current commit in the in-progress revert? The skipped commit will not be reverted.',
      { modal: true },
      'Skip Commit',
    );
    if (action !== 'Skip Commit') {
      return;
    }

    await this._gitOperationService.skipRevert({
      operationId,
      repositoryId: payload.repositoryId,
    });
  }

  private async _confirmSequencerStart(
    operationLabel: 'Cherry-pick' | 'Revert',
    commit: string,
    providedMainlineParent: number | undefined,
  ): Promise<number | undefined | false> {
    const action = await vscode.window.showWarningMessage(
      `${operationLabel} commit '${commit}'. Conflicts may need manual resolution.`,
      { modal: true },
      operationLabel,
    );
    if (action !== operationLabel) {
      return false;
    }

    return providedMainlineParent;
  }

  private async _handleResetRequest(
    payload: OperationResetRequestPayload,
    operationId: string,
  ): Promise<void> {
    let confirmedHardReset = payload.confirmedHardReset ?? false;

    if (payload.mode === 'hard' && !confirmedHardReset) {
      const action = await vscode.window.showWarningMessage(
        `Hard reset to '${payload.target}'? This can permanently discard uncommitted changes in your working tree and index.`,
        { modal: true },
        'Hard Reset',
      );
      if (action !== 'Hard Reset') {
        return;
      }
      confirmedHardReset = true;
    }

    await this._gitOperationService.reset({
      operationId,
      repositoryId: payload.repositoryId,
      target: payload.target,
      mode: payload.mode,
      ...(payload.mode === 'hard' ? { confirmedHardReset } : {}),
    });
  }

  private async _handleFetchRequest(
    payload: OperationFetchRequestPayload,
    operationId: string,
  ): Promise<void> {
    await this._gitOperationService.fetch({
      operationId,
      repositoryId: payload.repositoryId,
      remote: payload.remote,
      prune: payload.prune ?? true,
      ...(payload.all !== undefined ? { all: payload.all } : {}),
    });
  }

  private async _handleCommitsPageRequest(
    payload: CommitsPageRequestPayload,
    requestId?: string,
  ): Promise<void> {
    const gitRepo = await this._resolveRepository(payload.repositoryId);
    if (!gitRepo) {
      this._postRepositoryUnavailable(payload.repositoryId, requestId);
      return;
    }

    // Cancel old in-flight query for this repository on new initial request or filter change
    const isInitialQuery = !payload.cursor;
    if (isInitialQuery) {
      const existing = this._inFlightCommitsAbortControllers.get(payload.repositoryId);
      if (existing) {
        existing.abort();
        this._inFlightCommitsAbortControllers.delete(payload.repositoryId);
      }
    }

    const abortController = new AbortController();
    this._inFlightCommitsAbortControllers.set(payload.repositoryId, abortController);

    const safeLimit = clampPageSize(payload.limit);
    const queryKey = `commits:${payload.branch ?? ''}:${payload.cursor ?? ''}:${safeLimit}:${payload.search ?? ''}:${payload.searchType ?? ''}:${payload.author ?? ''}:${payload.dateSince ?? ''}:${payload.dateUntil ?? ''}:${payload.path ?? ''}:${payload.order ?? ''}`;

    try {
      const queryResult = await this._refreshCoordinator.runQuery<CommitPage>(
        payload.repositoryId,
        queryKey,
        () =>
          gitRepo.getCommits({
            limit: safeLimit,
            cursor: payload.cursor,
            ref: payload.branch,
            textQuery: payload.search,
            searchType: payload.searchType,
            author: payload.author,
            dateRange:
              payload.dateSince || payload.dateUntil
                ? { since: payload.dateSince, until: payload.dateUntil }
                : undefined,
            path: payload.path,
            order: payload.order,
            signal: abortController.signal,
          }),
      );

      if (this._inFlightCommitsAbortControllers.get(payload.repositoryId) === abortController) {
        this._inFlightCommitsAbortControllers.delete(payload.repositoryId);
      }

      // Discard stale result if repository was invalidated or query was aborted
      if (queryResult.isStale || abortController.signal.aborted) {
        return;
      }

      let commitPage = queryResult.result;
      if (
        !payload.cursor &&
        !payload.search &&
        !payload.author &&
        !payload.path &&
        !payload.dateSince &&
        !payload.dateUntil
      ) {
        try {
          const preflight = new OperationPreflight();
          const worktree = await preflight.checkWorkingTree(gitRepo);
          if (!worktree.isClean && worktree.dirtyFileCount > 0) {
            const firstCommit = commitPage.commits[0];
            const uncommittedCommit: Commit = {
              sha: '*',
              shortSha: '*',
              parents: firstCommit ? [firstCommit.sha] : [],
              author: {
                name: '*',
                email: '*',
                timestamp: Date.now(),
                timezone: '+0000',
              },
              committer: {
                name: '*',
                email: '*',
                timestamp: Date.now(),
                timezone: '+0000',
              },
              subject: `Uncommitted Changes (${worktree.dirtyFileCount})`,
              refs: [],
            };
            commitPage = {
              ...commitPage,
              commits: [uncommittedCommit, ...commitPage.commits],
            };
          }
        } catch {
          // Ignore preflight error if git status fails
        }
      }

      // Chunk large commit pages to prevent IPC transmission lags
      const chunks = splitCommitPageIntoChunks(commitPage, DEFAULT_CHUNK_SIZE);
      const totalChunks = chunks.length;

      for (let index = 0; index < totalChunks; index++) {
        if (abortController.signal.aborted) {
          return;
        }

        const chunkPage = chunks[index]!;
        const isLastChunk = index === totalChunks - 1;

        const msg = createMessage<'commits.page.result', CommitsPageResultPayload>(
          'commits.page.result',
          {
            requestId,
            repositoryId: payload.repositoryId,
            page: chunkPage,
            chunkIndex: index,
            totalChunks,
            isLastChunk,
          },
        );

        if (chunkPage.commits.length >= 100) {
          measureSerialization(msg);
        }

        this._panel.webview.postMessage(msg);
      }
    } catch (err: unknown) {
      if (this._inFlightCommitsAbortControllers.get(payload.repositoryId) === abortController) {
        this._inFlightCommitsAbortControllers.delete(payload.repositoryId);
      }
      const isAborted =
        abortController.signal.aborted ||
        (err instanceof Error &&
          (err.name === 'AbortError' ||
            err.message.toLowerCase().includes('aborted') ||
            err.message.toLowerCase().includes('canceled') ||
            err.message.toLowerCase().includes('cancelled')));
      if (isAborted) {
        return;
      }
      throw err;
    }
  }

  private async _handleSearchRequest(
    payload: SearchRequestPayload,
    requestId?: string,
  ): Promise<void> {
    const gitRepo = await this._resolveRepository(payload.repositoryId);
    if (!gitRepo) {
      this._postRepositoryUnavailable(payload.repositoryId, requestId);
      return;
    }

    try {
      const commits = await gitRepo.searchCommits(payload.query, {
        searchType: payload.searchType,
        limit: 50,
      });

      const msg = createMessage<'search.result', SearchResultPayload>(
        'search.result',
        {
          requestId,
          repositoryId: payload.repositoryId,
          query: payload.query,
          searchType: payload.searchType,
          commits,
        },
        requestId ? { requestId } : undefined,
      );
      this._panel.webview.postMessage(msg);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errMsg = createErrorMessage(
        `Search failed: ${errorMessage}`,
        AppErrorCode.UNKNOWN_ERROR,
        undefined,
        requestId,
      );
      this._panel.webview.postMessage(errMsg);
    }
  }

  private async _handleWorktreeStatusRequest(
    payload: WorktreeStatusRequestPayload,
    requestId?: string,
  ): Promise<void> {
    const gitRepo = await this._resolveRepository(payload.repositoryId);
    if (!gitRepo) {
      this._postRepositoryUnavailable(payload.repositoryId, requestId);
      return;
    }

    try {
      const status = await gitRepo.getWorktreeStatus();
      const msg = createMessage<'worktree.status.result', WorktreeStatusResultPayload>(
        'worktree.status.result',
        {
          requestId,
          repositoryId: payload.repositoryId,
          status,
        },
        requestId ? { requestId } : undefined,
      );
      this._panel.webview.postMessage(msg);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this._panel.webview.postMessage(
        createErrorMessage(
          `Failed to load working tree status: ${errorMessage}`,
          AppErrorCode.UNKNOWN_ERROR,
          undefined,
          requestId,
        ),
      );
    }
  }

  private async _handleWorktreeDiscardRequest(
    payload: WorktreeDiscardRequestPayload,
    operationId: string,
  ): Promise<void> {
    if (!payload.noConfirm) {
      const scope = payload.all
        ? 'all uncommitted changes'
        : `${payload.paths.length} file${payload.paths.length === 1 ? '' : 's'}`;
      const action = await vscode.window.showWarningMessage(
        `Discard ${scope}? This permanently removes the changes and cannot be undone.`,
        { modal: true },
        'Discard Changes',
      );
      if (action !== 'Discard Changes') {
        return;
      }
    }

    await this._gitOperationService.discardWorktree({
      operationId,
      repositoryId: payload.repositoryId,
      paths: payload.paths,
      all: payload.all,
      untracked: payload.untracked,
    });
  }

  private async _handleGitWorktreeListRequest(
    payload: GitWorktreeListRequestPayload,
    requestId?: string,
  ): Promise<void> {
    const gitRepo = await this._resolveRepository(payload.repositoryId);
    if (!gitRepo) {
      this._postRepositoryUnavailable(payload.repositoryId, requestId);
      return;
    }

    try {
      const worktrees = await gitRepo.listWorktrees();
      const current = worktrees.find((worktree) => worktree.isCurrent);
      const msg = createMessage<'worktree.list.result', GitWorktreeListResultPayload>(
        'worktree.list.result',
        {
          requestId,
          repositoryId: payload.repositoryId,
          worktrees,
          ...(current ? { currentPath: current.path } : {}),
        },
        requestId ? { requestId } : undefined,
      );
      this._panel.webview.postMessage(msg);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this._panel.webview.postMessage(
        createErrorMessage(
          t('Failed to list worktrees: {0}', errorMessage),
          AppErrorCode.UNKNOWN_ERROR,
          undefined,
          requestId,
        ),
      );
    }
  }

  private async _handleGitWorktreeOpenRequest(
    payload: GitWorktreeOpenRequestPayload,
  ): Promise<void> {
    const gitRepo = await this._resolveRepository(payload.repositoryId);
    if (!gitRepo) {
      this._postRepositoryUnavailable(payload.repositoryId);
      return;
    }

    const requestedPath = path.resolve(payload.path);
    const worktrees = await gitRepo.listWorktrees();
    const target = worktrees.find((worktree) => path.resolve(worktree.path) === requestedPath);
    if (!target) {
      this._panel.webview.postMessage(
        createErrorMessage(
          `No linked worktree found at '${payload.path}'.`,
          AppErrorCode.UNKNOWN_ERROR,
          { path: payload.path },
        ),
      );
      return;
    }

    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(target.path), true);
  }

  private async _handleSubmoduleListRequest(
    payload: SubmoduleListRequestPayload,
    requestId?: string,
  ): Promise<void> {
    const gitRepo = await this._resolveRepository(payload.repositoryId);
    if (!gitRepo) {
      this._postRepositoryUnavailable(payload.repositoryId, requestId);
      return;
    }

    try {
      const submodules = await gitRepo.listSubmodules();
      const msg = createMessage<'submodule.list.result', SubmoduleListResultPayload>(
        'submodule.list.result',
        {
          requestId,
          repositoryId: payload.repositoryId,
          submodules,
        },
        requestId ? { requestId } : undefined,
      );
      this._panel.webview.postMessage(msg);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this._panel.webview.postMessage(
        createErrorMessage(
          t('Failed to list submodules: {0}', errorMessage),
          AppErrorCode.UNKNOWN_ERROR,
          undefined,
          requestId,
        ),
      );
    }
  }

  private async _handleSubmoduleOpenRequest(payload: SubmoduleOpenRequestPayload): Promise<void> {
    const gitRepo = await this._resolveRepository(payload.repositoryId);
    if (!gitRepo) {
      this._postRepositoryUnavailable(payload.repositoryId);
      return;
    }

    const targetPath = path.resolve(gitRepo.rootPath, payload.path);
    const relative = path.relative(gitRepo.rootPath, targetPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      this._panel.webview.postMessage(
        createErrorMessage(
          `Refusing to open a submodule outside the repository: ${payload.path}`,
          AppErrorCode.UNKNOWN_ERROR,
          { path: payload.path },
        ),
      );
      return;
    }

    const repository = await this._repositoryManager.openRepository(targetPath);
    if (!repository) {
      this._panel.webview.postMessage(
        createErrorMessage(
          `Submodule is not initialized or is not a Git repository: ${payload.path}`,
          AppErrorCode.NOT_A_REPOSITORY,
          { path: payload.path },
        ),
      );
      return;
    }

    this._panel.webview.postMessage(
      createMessage<'repository.changed', { activeRepositoryId: string }>('repository.changed', {
        activeRepositoryId: repository.id,
      }),
    );
  }

  private async _handleStashListRequest(
    payload: StashListRequestPayload,
    requestId?: string,
  ): Promise<void> {
    const gitRepo = await this._resolveRepository(payload.repositoryId);
    if (!gitRepo) {
      this._postRepositoryUnavailable(payload.repositoryId, requestId);
      return;
    }

    try {
      const stashes = await gitRepo.listStashes();
      const msg = createMessage<'stash.list.result', StashListResultPayload>(
        'stash.list.result',
        {
          requestId,
          repositoryId: payload.repositoryId,
          stashes,
        },
        requestId ? { requestId } : undefined,
      );
      this._panel.webview.postMessage(msg);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this._panel.webview.postMessage(
        createErrorMessage(
          `Failed to list stashes: ${errorMessage}`,
          AppErrorCode.UNKNOWN_ERROR,
          undefined,
          requestId,
        ),
      );
    }
  }

  private async _handleStashSaveRequest(
    payload: StashSaveRequestPayload,
    operationId: string,
  ): Promise<void> {
    await this._gitOperationService.saveStash({
      operationId,
      repositoryId: payload.repositoryId,
      message: payload.message,
      includeUntracked: payload.includeUntracked,
      keepIndex: payload.keepIndex,
    });
  }

  private async _handleStashDropRequest(
    payload: StashActionRequestPayload,
    operationId: string,
  ): Promise<void> {
    const action = await vscode.window.showWarningMessage(
      `Drop stash@{${payload.index}}? This permanently removes the stash entry.`,
      { modal: true },
      'Drop Stash',
    );
    if (action !== 'Drop Stash') {
      return;
    }

    await this._gitOperationService.dropStash({
      operationId,
      repositoryId: payload.repositoryId,
      index: payload.index,
    });
  }

  private async _handleCommitDetailsRequest(
    payload: CommitDetailsRequestPayload,
    requestId?: string,
  ): Promise<void> {
    const gitRepo = await this._resolveRepository(payload.repositoryId);
    if (!gitRepo) {
      this._postRepositoryUnavailable(payload.repositoryId, requestId);
      return;
    }

    const sha = payload.targetSha ?? payload.sha;
    const parentSha = payload.baseSha ?? payload.parentSha;

    const commit = await this._commitDetailsController.getCommitDetails(
      payload.repositoryId,
      sha,
      parentSha,
    );
    if (!commit) {
      this._panel.webview.postMessage(
        createErrorMessage(
          `Commit details are no longer available for ${sha}`,
          AppErrorCode.GIT_COMMAND_FAILED,
          { repositoryId: payload.repositoryId, sha },
          requestId,
        ),
      );
      return;
    }
    const msg = createMessage<'commit.details.result', CommitDetailsResultPayload>(
      'commit.details.result',
      {
        requestId,
        repositoryId: payload.repositoryId,
        commit,
      },
    );
    this._panel.webview.postMessage(msg);
  }

  private async _handleCommitDiffRequest(
    payload: CommitDiffRequestPayload,
    requestId?: string,
  ): Promise<void> {
    const gitRepo = await this._resolveRepository(payload.repositoryId);
    if (!gitRepo) {
      this._postRepositoryUnavailable(payload.repositoryId, requestId);
      return;
    }

    try {
      const sha = payload.targetSha ?? payload.sha;
      const parentSha = payload.baseSha ?? payload.parentSha;

      const isUncommittedDiff =
        sha === 'UNCOMMITTED' || sha === '0000000000000000000000000000000000000000' || sha === '*';

      const result = isUncommittedDiff
        ? await this._getUncommittedDiff(
            gitRepo,
            payload.repositoryId,
            payload.filePath,
            Boolean(payload.staged),
            payload.maxBytes,
          )
        : await gitRepo.getDiff({
            sha,
            parentSha,
            baseSha: payload.baseSha,
            targetSha: payload.targetSha,
            filePath: payload.filePath,
            maxBytes: payload.maxBytes,
          });

      const msg = createMessage<'commit.diff.result', CommitDiffResultPayload>(
        'commit.diff.result',
        {
          requestId,
          repositoryId: payload.repositoryId,
          sha,
          diff: result.diff,
          parentSha,
          baseSha: payload.baseSha,
          targetSha: payload.targetSha,
          filePath: payload.filePath,
          isTruncated: result.isTruncated,
          isBinary: result.isBinary,
          truncatedBytes: result.truncatedBytes,
          totalBytes: result.totalBytes,
          ...(payload.staged ? { staged: true } : {}),
        },
        requestId ? { requestId } : undefined,
      );
      this._panel.webview.postMessage(msg);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errMsg = createErrorMessage(
        `Failed to retrieve diff: ${errorMessage}`,
        AppErrorCode.UNKNOWN_ERROR,
        undefined,
        requestId,
      );
      this._panel.webview.postMessage(errMsg);
    }
  }

  private async _getUncommittedDiff(
    gitRepo: GitRepository,
    repositoryId: string,
    filePath: string | undefined,
    staged: boolean,
    maxBytes?: number,
  ): Promise<{
    diff: string;
    isTruncated: boolean;
    isBinary: boolean;
    truncatedBytes?: number;
    totalBytes?: number;
  }> {
    let untracked = false;
    if (filePath && !staged) {
      const status = await gitRepo.getWorktreeStatus();
      untracked = status.unstaged.some(
        (file) => file.path === filePath && file.status === 'untracked',
      );
    }

    return gitRepo.getWorktreeDiff({
      ...(filePath ? { filePath } : {}),
      staged,
      untracked,
      ...(maxBytes ? { maxBytes } : {}),
    });
  }

  private async _handleDiffOpenRequest(payload: DiffOpenRequestPayload): Promise<void> {
    const gitRepo = await this._resolveRepository(payload.repositoryId);
    if (!gitRepo) {
      this._postRepositoryUnavailable(payload.repositoryId);
      return;
    }

    let parentSha = payload.baseSha ?? payload.parentSha;
    const sha = payload.targetSha ?? payload.sha;
    const filePath = payload.filePath;
    const oldFilePath = payload.oldFilePath || filePath;

    const isUncommitted =
      sha === 'UNCOMMITTED' || sha === '0000000000000000000000000000000000000000' || sha === '*';

    if (!parentSha && !isUncommitted) {
      try {
        const commitDetails = await this._commitDetailsController.getCommitDetails(
          payload.repositoryId,
          sha,
        );
        if (commitDetails && commitDetails.parents && commitDetails.parents.length > 0) {
          parentSha = commitDetails.parents[0];
        }
      } catch {
        // Fallback
      }
    }

    let leftUri: vscode.Uri;
    let rightUri: vscode.Uri;
    let title: string;

    if (isUncommitted) {
      const parent = parentSha || 'HEAD';
      leftUri = GitRevisionContentProvider.buildUri(payload.repositoryId, parent, oldFilePath);
      if (payload.staged) {
        rightUri = GitRevisionContentProvider.buildUri(
          payload.repositoryId,
          GitRevisionContentProvider.INDEX_SHA,
          filePath,
        );
        title = `${filePath} (HEAD ↔ Index)`;
      } else {
        const absPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(gitRepo.rootPath, filePath);
        rightUri = vscode.Uri.file(absPath);
        title = `${filePath} (HEAD ↔ Working Tree)`;
      }
    } else {
      leftUri = GitRevisionContentProvider.buildUri(payload.repositoryId, parentSha, oldFilePath);
      rightUri = GitRevisionContentProvider.buildUri(payload.repositoryId, sha, filePath);
      title = `${filePath} (${parentSha ? parentSha.slice(0, 7) : 'empty'} ↔ ${sha.slice(0, 7)})`;
    }

    try {
      await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
    } catch {
      // Fallback
    }
  }

  private async _handleOpenFileRevisionRequest(
    payload: FileOpenRevisionRequestPayload,
  ): Promise<void> {
    const gitRepo = await this._resolveRepository(payload.repositoryId);
    if (!gitRepo) {
      this._postRepositoryUnavailable(payload.repositoryId);
      return;
    }

    const { filePath, sha } = payload;
    const isUncommitted =
      !sha ||
      sha === 'UNCOMMITTED' ||
      sha === '*' ||
      sha === '0000000000000000000000000000000000000000';

    try {
      if (isUncommitted) {
        const absPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(gitRepo.rootPath, filePath);
        await vscode.window.showTextDocument(vscode.Uri.file(absPath));
      } else {
        const uri = GitRevisionContentProvider.buildUri(payload.repositoryId, sha, filePath);
        await vscode.window.showTextDocument(uri);
      }
    } catch {
      // Fallback
    }
  }

  /**
   * Sends initial bootstrap payload to the webview.
   */
  public sendBootstrap(): void {
    const isLight = vscode.window.activeColorTheme?.kind === vscode.ColorThemeKind.Light;
    const isHighContrast =
      vscode.window.activeColorTheme?.kind === vscode.ColorThemeKind.HighContrast ||
      vscode.window.activeColorTheme?.kind === vscode.ColorThemeKind.HighContrastLight;

    const theme = isHighContrast ? 'high-contrast' : isLight ? 'light' : 'dark';
    const config = this._readViewConfig();

    const postPayload = (repositories: RepositoryItem[]) => {
      const activeRepo = this._repositoryManager.getActiveRepository();
      const activeRepositoryId = activeRepo?.id ?? repositories[0]?.id;

      const bootstrapMsg = createMessage<'app.bootstrap', AppBootstrapPayload>('app.bootstrap', {
        protocolVersion: 1,
        repositories,
        activeRepositoryId,
        theme,
        locale: (vscode as { env?: { language?: string } }).env?.language ?? 'en',
        config,
      });

      this._panel.webview.postMessage(bootstrapMsg);
    };

    if (this._repositoryManager.isDiscovered) {
      postPayload(this._repositoryManager.getRepositories());
    } else {
      const workspaceFolders = vscode.workspace.workspaceFolders || [];
      const immediateRepos: RepositoryItem[] =
        workspaceFolders.length > 0
          ? workspaceFolders.map((wf, idx) => ({
              id: `repo-${idx}`,
              name: wf.name,
              path: wf.uri.fsPath,
              currentBranch: 'main',
            }))
          : [
              {
                id: 'repo-workspace',
                name: 'Workspace Repository',
                path: '',
                currentBranch: 'main',
              },
            ];
      postPayload(immediateRepos);

      void this._repositoryManager.discoverRepositories();
    }
  }

  /**
   * Sends discovered repository list to the webview.
   */
  public sendRepositoriesList(repositories?: RepositoryDescriptor[], requestId?: string): void {
    const repos = repositories ?? this._repositoryManager.getRepositories();
    const listResultMsg = createMessage<'repositories.list.result', RepositoriesListResultPayload>(
      'repositories.list.result',
      {
        requestId,
        repositories: repos,
      },
      { requestId },
    );
    this._panel.webview.postMessage(listResultMsg);
  }

  /**
   * Sends path filter to the webview.
   */
  public setPathFilter(path: string, repositoryId?: string): void {
    const msg = createMessage<'filter.path.set', FilterPathSetPayload>('filter.path.set', {
      path,
      repositoryId,
    });
    this._panel.webview.postMessage(msg);
  }

  public dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;

    if (GitGraphPanel.currentPanel === this) {
      GitGraphPanel.currentPanel = undefined;
    }

    for (const controller of this._inFlightCommitsAbortControllers.values()) {
      controller.abort();
    }
    this._inFlightCommitsAbortControllers.clear();
    // Clean up panel and services
    this._panel.dispose();
    this._repositoryManager.dispose();
    this._repositoryWatcher.dispose();
    this._refreshCoordinator.dispose();

    // Dispose all tracked subscriptions to prevent duplicate listeners
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
