import type {
  Commit,
  CommitDetails,
  CommitPage,
  DiffResult,
  GitRef,
  RepositoryDescriptor,
  RepositoryRefsResult,
  StashEntry,
  WorktreeStatus,
  RemoteInfo,
  ReflogEntry,
  BlameResult,
  LineHistoryResult,
  RebasePlanEntry,
  GitWorktreeInfo,
  SubmoduleInfo,
} from '@git-graph/shared';
import { GitCliClient } from '../client/GitCliClient';
import type { GitClient, GitExecutionOptions } from '../client/GitClient';
import type { GitResult } from '../client/GitResult';
import { CommitDetailsQuery, type CommitDetailsQueryOptions } from '../queries/CommitDetailsQuery';
import { CommitQuery, type CommitQueryOptions } from '../queries/CommitQuery';
import {
  DiffQuery,
  type DiffQueryOptions,
  type WorktreeDiffQueryOptions,
} from '../queries/DiffQuery';
import { RefQuery, type RefQueryOptions } from '../queries/RefQuery';
import { BlameQuery, type BlameQueryOptions } from '../queries/BlameQuery';
import { LineHistoryQuery } from '../queries/LineHistoryQuery';
import { RemoteQuery } from '../queries/RemoteQuery';
import { ReflogQuery } from '../queries/ReflogQuery';
import { RebasePlanQuery } from '../queries/RebasePlanQuery';
import {
  StashQuery,
  WorktreeQuery,
  type WorktreeCommitOptions,
  type WorktreeCommitResult,
  type WorktreeDiscardOptions,
} from '../queries/WorktreeQuery';
import { GitWorktreeQuery, type GitWorktreeAddOptions } from '../queries/GitWorktreeQuery';
import { SubmoduleQuery } from '../queries/SubmoduleQuery';
import { RepositoryLocator } from './RepositoryLocator';

export interface GitRepositoryOptions {
  client?: GitClient;
  commitQuery?: CommitQuery;
  commitDetailsQuery?: CommitDetailsQuery;
  diffQuery?: DiffQuery;
  refQuery?: RefQuery;
  remoteQuery?: RemoteQuery;
  reflogQuery?: ReflogQuery;
  rebasePlanQuery?: RebasePlanQuery;
  blameQuery?: BlameQuery;
  lineHistoryQuery?: LineHistoryQuery;
  worktreeQuery?: WorktreeQuery;
  gitWorktreeQuery?: GitWorktreeQuery;
  submoduleQuery?: SubmoduleQuery;
  stashQuery?: StashQuery;
  locator?: RepositoryLocator;
  knownRemotes?: string[];
}

/**
 * Represents an open Git repository and provides high-level operations for
 * querying commits, inspect details, and reading repository state.
 */
export class GitRepository {
  public readonly descriptor: RepositoryDescriptor;
  private readonly _client: GitClient;
  private readonly _commitQuery: CommitQuery;
  private readonly _commitDetailsQuery: CommitDetailsQuery;
  private readonly _diffQuery: DiffQuery;
  private readonly _refQuery: RefQuery;
  private readonly _remoteQuery: RemoteQuery;
  private readonly _reflogQuery: ReflogQuery;
  private readonly _rebasePlanQuery: RebasePlanQuery;
  private readonly _blameQuery: BlameQuery;
  private readonly _lineHistoryQuery: LineHistoryQuery;
  private readonly _worktreeQuery: WorktreeQuery;
  private readonly _gitWorktreeQuery: GitWorktreeQuery;
  private readonly _submoduleQuery: SubmoduleQuery;
  private readonly _stashQuery: StashQuery;
  private _knownRemotes?: string[];

  public constructor(descriptor: RepositoryDescriptor, options?: GitRepositoryOptions) {
    this.descriptor = descriptor;
    this._client = options?.client ?? new GitCliClient();
    this._commitQuery = options?.commitQuery ?? new CommitQuery({ client: this._client });
    this._commitDetailsQuery =
      options?.commitDetailsQuery ?? new CommitDetailsQuery({ client: this._client });
    this._diffQuery = options?.diffQuery ?? new DiffQuery({ client: this._client });
    this._refQuery = options?.refQuery ?? new RefQuery({ client: this._client });
    this._remoteQuery = options?.remoteQuery ?? new RemoteQuery({ client: this._client });
    this._reflogQuery = options?.reflogQuery ?? new ReflogQuery({ client: this._client });
    this._rebasePlanQuery =
      options?.rebasePlanQuery ?? new RebasePlanQuery({ client: this._client });
    this._blameQuery = options?.blameQuery ?? new BlameQuery({ client: this._client });
    this._lineHistoryQuery =
      options?.lineHistoryQuery ?? new LineHistoryQuery({ client: this._client });
    this._worktreeQuery = options?.worktreeQuery ?? new WorktreeQuery({ client: this._client });
    this._gitWorktreeQuery =
      options?.gitWorktreeQuery ?? new GitWorktreeQuery({ client: this._client });
    this._submoduleQuery = options?.submoduleQuery ?? new SubmoduleQuery({ client: this._client });
    this._stashQuery = options?.stashQuery ?? new StashQuery({ client: this._client });
    this._knownRemotes = options?.knownRemotes;
  }

  /**
   * Opens a Git repository at the specified filesystem directory path.
   * Resolves repository metadata using RepositoryLocator.
   * Returns null if the path is not a valid Git repository.
   */
  public static async open(
    pathOrDescriptor: string | RepositoryDescriptor,
    options?: GitRepositoryOptions,
  ): Promise<GitRepository | null> {
    if (typeof pathOrDescriptor !== 'string') {
      return new GitRepository(pathOrDescriptor, options);
    }

    const locator = options?.locator ?? new RepositoryLocator({ gitClient: options?.client });
    const descriptor = await locator.locate(pathOrDescriptor);
    if (!descriptor) {
      return null;
    }

    return new GitRepository(descriptor, options);
  }

  /**
   * The repository root working directory path.
   */
  public get rootPath(): string {
    return this.descriptor.rootPath;
  }

  /**
   * The .git directory or metadata directory path.
   */
  public get gitDir(): string {
    return this.descriptor.gitDir;
  }

  /**
   * Whether this repository is a bare Git repository.
   */
  public get isBare(): boolean {
    return this.descriptor.isBare;
  }

  /**
   * Unique repository identifier.
   */
  public get id(): string {
    return this.descriptor.id;
  }

  /**
   * Human-friendly repository name.
   */
  public get name(): string {
    return this.descriptor.name;
  }

  /**
   * Underlying GitClient instance.
   */
  public get client(): GitClient {
    return this._client;
  }

  /**
   * Executes a Git command within this repository's root working directory.
   */
  public async exec(args: readonly string[], options?: GitExecutionOptions): Promise<GitResult> {
    return this._client.exec(args, { cwd: this.rootPath, ...options });
  }

  /**
   * Retrieves configured remote names for this repository (e.g. ['origin', 'upstream']).
   */
  public async getRemotes(): Promise<string[]> {
    if (this._knownRemotes) {
      return this._knownRemotes;
    }

    try {
      const res = await this._client.exec(['remote'], { cwd: this.rootPath });
      if (res.exitCode === 0) {
        this._knownRemotes = res.stdout
          .split('\n')
          .map((r) => r.trim())
          .filter(Boolean);
        return this._knownRemotes;
      }
    } catch {
      // Fallback
    }

    return ['origin'];
  }

  public async getRemoteDetails(signal?: AbortSignal): Promise<RemoteInfo[]> {
    return this._remoteQuery.list(this.rootPath, signal);
  }

  public async listReflog(limit = 20, signal?: AbortSignal): Promise<ReflogEntry[]> {
    return this._reflogQuery.list(this.rootPath, limit, signal);
  }

  /**
   * Builds an interactive rebase plan for commits between the given target and HEAD.
   */
  public async getRebasePlan(onto: string, signal?: AbortSignal): Promise<RebasePlanEntry[]> {
    return this._rebasePlanQuery.list(this.rootPath, onto, signal);
  }

  /**
   * Queries a paginated list of commits.
   */
  public async getCommits(options?: CommitQueryOptions): Promise<CommitPage> {
    const remotes = options?.knownRemotes ?? (await this.getRemotes());
    return this._commitQuery.queryCommits(this.rootPath, {
      ...options,
      knownRemotes: remotes,
    });
  }

  /**
   * Searches commits across the repository matching query in subject, author, ref, or hash.
   */
  public async searchCommits(query: string, options?: CommitQueryOptions): Promise<Commit[]> {
    const remotes = options?.knownRemotes ?? (await this.getRemotes());
    return this._commitQuery.searchCommits(this.rootPath, query, {
      ...options,
      knownRemotes: remotes,
    });
  }

  /**
   * Queries detailed commit information including full commit body, file changes, and stats.
   */
  public async getCommitDetails(
    sha: string,
    optionsOrParentSha?: string | CommitDetailsQueryOptions,
  ): Promise<Commit | null> {
    const remotes = await this.getRemotes();
    const options: CommitDetailsQueryOptions =
      typeof optionsOrParentSha === 'string'
        ? { parentSha: optionsOrParentSha, knownRemotes: remotes }
        : { ...optionsOrParentSha, knownRemotes: optionsOrParentSha?.knownRemotes ?? remotes };

    const details = await this._commitDetailsQuery.queryDetails(this.rootPath, sha, options);
    return details ? details.commit : null;
  }

  /**
   * Queries full CommitDetails object including commit metadata, file changes, and stats.
   */
  public async getCommitDetailsWithStats(
    sha: string,
    optionsOrParentSha?: string | CommitDetailsQueryOptions,
  ): Promise<CommitDetails | null> {
    const remotes = await this.getRemotes();
    const options: CommitDetailsQueryOptions =
      typeof optionsOrParentSha === 'string'
        ? { parentSha: optionsOrParentSha, knownRemotes: remotes }
        : { ...optionsOrParentSha, knownRemotes: optionsOrParentSha?.knownRemotes ?? remotes };

    return this._commitDetailsQuery.queryDetails(this.rootPath, sha, options);
  }

  /**
   * Retrieves the raw full commit body for a given commit.
   */
  public async getCommitBody(sha: string): Promise<string | null> {
    return this._commitQuery.getCommitBody(this.rootPath, sha);
  }

  /**
   * Retrieves the diff patch string for a given commit.
   */
  public async getCommitDiff(
    shaOrOptions: string | DiffQueryOptions,
    parentSha?: string,
  ): Promise<string> {
    if (typeof shaOrOptions === 'string') {
      const result = await this._diffQuery.queryDiff(this.rootPath, {
        sha: shaOrOptions,
        parentSha,
      });
      return result.diff;
    }
    const result = await this._diffQuery.queryDiff(this.rootPath, shaOrOptions);
    return result.diff;
  }

  /**
   * Queries structured diff result including truncation and binary file indicators.
   */
  public async getDiff(options: DiffQueryOptions): Promise<DiffResult> {
    return this._diffQuery.queryDiff(this.rootPath, options);
  }

  /**
   * Queries the diff between HEAD and the working tree (unstaged) or the index (staged).
   */
  public async getWorktreeDiff(options: WorktreeDiffQueryOptions): Promise<DiffResult> {
    return this._diffQuery.queryWorktreeDiff(this.rootPath, options);
  }

  /**
   * Retrieves the raw content of a file at a specific commit SHA or ref.
   */
  public async getFileContent(sha: string, filePath: string): Promise<string> {
    const cleanSha = sha.trim();
    const cleanPath = filePath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!cleanSha || !cleanPath) {
      return '';
    }
    try {
      const res = await this._client.exec(['show', `${cleanSha}:${cleanPath}`], {
        cwd: this.rootPath,
      });
      return res.exitCode === 0 ? res.stdout : '';
    } catch {
      return '';
    }
  }

  /**
   * Queries all repository references (branches, tags, HEAD).
   */
  public async getRefs(options?: RefQueryOptions): Promise<RepositoryRefsResult> {
    return this._refQuery.queryRefs(this.rootPath, options);
  }

  /**
   * Retrieves repository branches.
   */
  public async getBranches(options?: {
    includeRemote?: boolean;
    includeSymbolic?: boolean;
  }): Promise<GitRef[]> {
    return this._refQuery.getBranches(this.rootPath, options);
  }

  /**
   * Retrieves local branches.
   */
  public async getLocalBranches(): Promise<GitRef[]> {
    return this._refQuery.getLocalBranches(this.rootPath);
  }

  /**
   * Retrieves remote tracking branches.
   */
  public async getRemoteBranches(options?: { includeSymbolic?: boolean }): Promise<GitRef[]> {
    return this._refQuery.getRemoteBranches(this.rootPath, options);
  }

  /**
   * Retrieves repository tags (lightweight and annotated).
   */
  public async getTags(): Promise<GitRef[]> {
    return this._refQuery.getTags(this.rootPath);
  }

  /**
   * Retrieves current HEAD ref, or null if repository has no commits.
   */
  public async getHead(): Promise<GitRef | null> {
    return this._refQuery.getHead(this.rootPath);
  }

  /**
   * Retrieves line-by-line blame metadata for a file at an optional revision.
   */
  public async getBlame(
    filePath: string,
    revision?: string,
    options?: Omit<BlameQueryOptions, 'revision'>,
  ): Promise<BlameResult> {
    return this._blameQuery.query(this.rootPath, filePath, {
      ...options,
      ...(revision ? { revision } : {}),
      repositoryId: this.id,
    });
  }

  /**
   * Retrieves the commit history for a line range in a file.
   */
  public async getLineHistory(
    filePath: string,
    startLine: number,
    endLine = startLine,
    signal?: AbortSignal,
  ): Promise<LineHistoryResult> {
    return this._lineHistoryQuery.query(this.rootPath, filePath, startLine, endLine, {
      ...(signal ? { signal } : {}),
    });
  }

  /**
   * Queries the working tree and index state, including staged/unstaged files.
   */
  public async getWorktreeStatus(): Promise<WorktreeStatus> {
    return this._worktreeQuery.getStatus(this.rootPath);
  }

  /**
   * Stages files (or all changes) in the index.
   */
  public async stageWorktree(paths: string[], all = false): Promise<void> {
    return this._worktreeQuery.stage(this.rootPath, paths, all);
  }

  /**
   * Removes staged files from the index without touching the working tree.
   */
  public async unstageWorktree(paths: string[], all = false): Promise<void> {
    return this._worktreeQuery.unstage(this.rootPath, paths, all);
  }

  /**
   * Discards working tree/index changes for the given files.
   */
  public async discardWorktree(options: WorktreeDiscardOptions): Promise<void> {
    return this._worktreeQuery.discard(this.rootPath, options);
  }

  /**
   * Creates (or amends) a commit from the staged changes.
   */
  public async createCommit(options: WorktreeCommitOptions): Promise<WorktreeCommitResult> {
    return this._worktreeQuery.commit(this.rootPath, options);
  }

  /**
   * Lists linked Git worktrees for this repository.
   */
  public async listWorktrees(): Promise<GitWorktreeInfo[]> {
    return this._gitWorktreeQuery.list(this.rootPath);
  }

  /**
   * Creates a linked worktree and returns the refreshed worktree list.
   */
  public async addWorktree(options: GitWorktreeAddOptions): Promise<GitWorktreeInfo[]> {
    return this._gitWorktreeQuery.add(this.rootPath, options);
  }

  /**
   * Removes a linked worktree and returns the refreshed worktree list.
   */
  public async removeWorktree(worktreePath: string, force = false): Promise<GitWorktreeInfo[]> {
    return this._gitWorktreeQuery.remove(this.rootPath, worktreePath, force);
  }

  /**
   * Lists configured submodules with their current checkout state.
   */
  public async listSubmodules(): Promise<SubmoduleInfo[]> {
    return this._submoduleQuery.list(this.rootPath);
  }

  /**
   * Lists stashes in reverse chronological order.
   */
  public async listStashes(): Promise<StashEntry[]> {
    return this._stashQuery.list(this.rootPath);
  }

  /**
   * Saves the current working tree changes into a new stash.
   */
  public async saveStash(options?: {
    message?: string;
    includeUntracked?: boolean;
    keepIndex?: boolean;
  }): Promise<void> {
    return this._stashQuery.save(this.rootPath, options);
  }

  /**
   * Applies and removes the stash at the given index.
   */
  public async popStash(index: number): Promise<void> {
    return this._stashQuery.pop(this.rootPath, index);
  }

  /**
   * Applies the stash at the given index without removing it.
   */
  public async applyStash(index: number): Promise<void> {
    return this._stashQuery.apply(this.rootPath, index);
  }

  /**
   * Drops the stash at the given index.
   */
  public async dropStash(index: number): Promise<void> {
    return this._stashQuery.drop(this.rootPath, index);
  }

  /**
   * Retrieves content from the index (staged version) for a file path.
   */
  public async getIndexFileContent(filePath: string): Promise<string> {
    const cleanPath = filePath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!cleanPath) {
      return '';
    }
    try {
      const res = await this._client.exec(['show', `:${cleanPath}`], { cwd: this.rootPath });
      return res.exitCode === 0 ? res.stdout : '';
    } catch {
      return '';
    }
  }
}
