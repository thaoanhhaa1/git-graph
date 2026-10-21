import * as vscode from 'vscode';
import { GitRepository, GitCliClient, type GitClient } from '@git-graph/git-core';
import { RepositoryManager } from '../repositories/RepositoryManager';
import { RepositoryWatcher } from '../watchers/RepositoryWatcher';

export interface GitGraphStatusBarOptions {
  repositoryManager?: RepositoryManager;
  repositoryWatcher?: RepositoryWatcher;
  client?: GitClient;
}

/**
 * Manages the Git Graph status bar item displaying current branch and ahead/behind counts.
 */
export class GitGraphStatusBar implements vscode.Disposable {
  private readonly _statusBarItem: vscode.StatusBarItem;
  private readonly _repositoryManager: RepositoryManager;
  private readonly _repositoryWatcher: RepositoryWatcher;
  private readonly _gitClient: GitClient;
  private readonly _ownsManager: boolean;
  private readonly _ownsWatcher: boolean;
  private readonly _disposables: vscode.Disposable[] = [];
  private _updateTimer?: ReturnType<typeof setTimeout>;

  public constructor(options?: GitGraphStatusBarOptions) {
    this._gitClient = options?.client ?? new GitCliClient();
    this._ownsManager = !options?.repositoryManager;
    this._ownsWatcher = !options?.repositoryWatcher;
    this._repositoryManager = options?.repositoryManager ?? new RepositoryManager();
    this._repositoryWatcher = options?.repositoryWatcher ?? new RepositoryWatcher();

    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this._statusBarItem.command = 'gitGraph.openGraph';
    this._statusBarItem.tooltip = 'View Git Graph CTS';

    this._disposables.push(
      this._statusBarItem,
      this._repositoryManager.onDidChangeActiveRepository(() => this.scheduleUpdate()),
      this._repositoryManager.onDidChangeRepositories((repos) => {
        if (this._ownsWatcher) {
          this._repositoryWatcher.setWatchedRepositories(repos);
        }
        this.scheduleUpdate();
      }),
      this._repositoryWatcher.onDidRepositoryChange(() => this.scheduleUpdate()),
    );

    if (vscode.workspace.onDidChangeConfiguration) {
      this._disposables.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
          if (e.affectsConfiguration('gitGraph.showStatusBarItem')) {
            this.scheduleUpdate();
          }
        }),
      );
    }

    if (vscode.window.onDidChangeActiveTextEditor) {
      this._disposables.push(
        vscode.window.onDidChangeActiveTextEditor(() => this.scheduleUpdate()),
      );
    }

    if (this._ownsManager) {
      void this._repositoryManager.discoverRepositories().then(() => this.update());
    } else {
      void this.update();
    }
  }

  public get statusBarItem(): vscode.StatusBarItem {
    return this._statusBarItem;
  }

  public scheduleUpdate(delayMs = 100): void {
    if (this._updateTimer) {
      clearTimeout(this._updateTimer);
    }
    this._updateTimer = setTimeout(() => {
      void this.update();
    }, delayMs);
  }

  /**
   * Refreshes the status bar item text and visibility from active repository state.
   */
  public async update(): Promise<void> {
    const config = vscode.workspace.getConfiguration?.('gitGraph');
    const showStatusBarItem = config?.get<boolean>('showStatusBarItem', true) ?? true;
    if (!showStatusBarItem) {
      this._statusBarItem.hide();
      return;
    }

    const activeRepo = this._repositoryManager.getActiveRepository();
    if (!activeRepo) {
      this._statusBarItem.hide();
      return;
    }

    try {
      const gitRepo = await GitRepository.open(activeRepo, { client: this._gitClient });
      if (!gitRepo) {
        this._statusBarItem.hide();
        return;
      }

      const refs = await gitRepo.getRefs();
      const head = refs.head;
      const currentBranch = refs.currentBranch;

      if (!currentBranch) {
        this._statusBarItem.text = '$(git-branch) Git Graph CTS';
        this._statusBarItem.tooltip = head?.target
          ? `Git Graph CTS: (${head.target.slice(0, 7)})\nClick to view Git Graph`
          : 'View Git Graph CTS';
        this._statusBarItem.show();
        return;
      }

      // Check upstream tracking branch and compute ahead / behind
      const localBranch = refs.localBranches.find((b) => b.name === currentBranch);
      const upstream = localBranch?.upstream;

      let aheadBehindSuffix = '';
      if (upstream) {
        try {
          const res = await this._gitClient.exec(
            ['rev-list', '--left-right', '--count', `${currentBranch}...${upstream}`],
            { cwd: gitRepo.rootPath },
          );
          if (res.exitCode === 0 && res.stdout.trim()) {
            const parts = res.stdout.trim().split(/\s+/);
            const ahead = parseInt(parts[0] || '0', 10) || 0;
            const behind = parseInt(parts[1] || '0', 10) || 0;
            if (ahead > 0) {
              aheadBehindSuffix += ` ↑${ahead}`;
            }
            if (behind > 0) {
              aheadBehindSuffix += ` ↓${behind}`;
            }
          }
        } catch {
          // Ignore rev-list error and show branch name without suffix
        }
      }

      this._statusBarItem.text = `$(git-branch) Git Graph CTS${aheadBehindSuffix}`;
      this._statusBarItem.tooltip = `Git Graph CTS: ${currentBranch}${aheadBehindSuffix}\nClick to view Git Graph`;
      this._statusBarItem.show();
    } catch {
      this._statusBarItem.hide();
    }
  }

  public dispose(): void {
    if (this._updateTimer) {
      clearTimeout(this._updateTimer);
    }
    for (const d of this._disposables) {
      d.dispose();
    }
    if (this._ownsWatcher) {
      this._repositoryWatcher.dispose();
    }
    if (this._ownsManager) {
      this._repositoryManager.dispose();
    }
  }
}
