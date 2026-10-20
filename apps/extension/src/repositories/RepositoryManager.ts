import * as vscode from 'vscode';
import type { RepositoryDescriptor } from '@git-graph/shared';
import { GitRepository, RepositoryLocator } from '@git-graph/git-core';

export interface RepositoryManagerOptions {
  locator?: RepositoryLocator;
}

/**
 * Manages the lifecycle of discovered Git repositories within the VS Code workspace.
 */
export class RepositoryManager implements vscode.Disposable {
  private readonly _locator: RepositoryLocator;
  private _repositories: RepositoryDescriptor[] = [];
  private readonly _repositoryInstances = new Map<string, GitRepository>();
  private _activeRepositoryId?: string;
  private _isDiscovered = false;

  private readonly _onDidChangeRepositories = new vscode.EventEmitter<RepositoryDescriptor[]>();
  public readonly onDidChangeRepositories: vscode.Event<RepositoryDescriptor[]> =
    this._onDidChangeRepositories.event;

  private readonly _onDidChangeActiveRepository = new vscode.EventEmitter<
    RepositoryDescriptor | undefined
  >();
  public readonly onDidChangeActiveRepository: vscode.Event<RepositoryDescriptor | undefined> =
    this._onDidChangeActiveRepository.event;

  private _disposables: vscode.Disposable[] = [];

  public constructor(options?: RepositoryManagerOptions) {
    this._locator = options?.locator ?? new RepositoryLocator();

    // Auto-discover repositories whenever workspace folders change
    if (vscode.workspace.onDidChangeWorkspaceFolders) {
      const folderSub = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.discoverRepositories();
      });
      this._disposables.push(folderSub);
    }
  }

  private _discoveryPromise?: Promise<RepositoryDescriptor[]>;

  /**
   * Discovers all Git repositories in the current workspace folders.
   * Performs deduplication for nested workspace folders pointing to the same repository.
   */
  public async discoverRepositories(): Promise<RepositoryDescriptor[]> {
    if (this._discoveryPromise) {
      return this._discoveryPromise;
    }

    this._discoveryPromise = (async () => {
      try {
        const folders = vscode.workspace.workspaceFolders || [];
        const candidatePaths = folders.map((f) => f.uri.fsPath);

        const discovered = await this._locator.locateAll(candidatePaths);
        this._repositories = discovered;
        this._isDiscovered = true;

        // Preserve active repository if still present, otherwise fallback to first
        const stillExists = this._repositories.some((r) => r.id === this._activeRepositoryId);
        if (!stillExists) {
          this._activeRepositoryId = this._repositories[0]?.id;
          this._onDidChangeActiveRepository.fire(this.getActiveRepository());
        }

        this._onDidChangeRepositories.fire(this._repositories);
        return this._repositories;
      } finally {
        this._discoveryPromise = undefined;
      }
    })();

    return this._discoveryPromise;
  }

  /**
   * Returns whether repository discovery has already executed at least once.
   */
  public get isDiscovered(): boolean {
    return this._isDiscovered;
  }

  /**
   * Returns current list of discovered repositories.
   */
  public getRepositories(): RepositoryDescriptor[] {
    return [...this._repositories];
  }

  /**
   * Returns the currently active repository, or undefined if no repositories exist.
   */
  public getActiveRepository(): RepositoryDescriptor | undefined {
    if (!this._repositories.length) {
      return undefined;
    }
    return (
      this._repositories.find((r) => r.id === this._activeRepositoryId) ?? this._repositories[0]
    );
  }

  /**
   * Sets the active repository by ID.
   */
  public setActiveRepository(id: string): void {
    if (this._activeRepositoryId === id) {
      return;
    }
    const target = this._repositories.find((r) => r.id === id);
    if (target) {
      this._activeRepositoryId = id;
      this._onDidChangeActiveRepository.fire(target);
    }
  }

  /**
   * Returns a GitRepository instance for the given repository ID or placeholder.
   */
  public getRepository(id: string): GitRepository | undefined {
    let descriptor = this._repositories.find((r) => r.id === id);
    if (!descriptor) {
      descriptor = this._repositories.find((r) => r.path === id);
    }
    if (!descriptor) {
      const match = /^repo-(\d+)$/.exec(id);
      if (match && match[1]) {
        const idx = parseInt(match[1], 10);
        descriptor = this._repositories[idx];
      } else if (id === 'repo-workspace') {
        descriptor = this._repositories[0];
      }
    }
    if (!descriptor) {
      return undefined;
    }
    let instance = this._repositoryInstances.get(descriptor.id);
    if (!instance) {
      instance = new GitRepository(descriptor);
      this._repositoryInstances.set(descriptor.id, instance);
    }
    return instance;
  }

  /**
   * Returns the GitRepository instance for the active repository, if one exists.
   */
  public getActiveGitRepository(): GitRepository | undefined {
    const active = this.getActiveRepository();
    return active ? this.getRepository(active.id) : undefined;
  }

  /**
   * Refreshes discovered repositories.
   */
  public async refresh(): Promise<RepositoryDescriptor[]> {
    return this.discoverRepositories();
  }

  public dispose(): void {
    this._onDidChangeRepositories.dispose();
    this._onDidChangeActiveRepository.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      d?.dispose();
    }
  }
}
