/**
 * Simple in‑memory cache for repository‑level data used by the extension.
 *
 * The implementation is intentionally lightweight – it stores values in a
 * `Map<string, any>` keyed by a repository identifier (usually the absolute
 * path to the git working tree).  Each cache entry is an object that can hold
 * any of the data shapes described in the implementation plan (metadata,
 * refs, commit pages, graph continuation state, commit details, diff
 * metadata, …).
 *
 * The cache is **not** persisted to disk; it lives only for the lifetime of
 * the extension process.  This matches the current MVP requirements where the
 * extension is reloaded on VS Code restart.
 */

export interface RepositoryCacheEntry {
  /** Repository metadata such as `git status` information */
  metadata?: unknown;
  /** Snapshot of refs (branches, tags, etc.) */
  refs?: unknown;
  /** Paged commit list – the key is the page number */
  commitPages?: Record<string, unknown>;
  /** Graph continuation state used for incremental loading */
  graphContinuation?: unknown;
  /** Detailed commit information (e.g. CommitDetailsQuery result) */
  commitDetails?: Record<string, unknown>;
  /** Short‑term diff metadata */
  diffMetadata?: unknown;
}

/**
 * RepositoryCache provides static methods so it can be accessed from anywhere
 * without needing to instantiate a class.  Internally a `Map` stores the cache
 * entries keyed by the repository root path.
 */
export class RepositoryCache {
  private static readonly cache = new Map<string, RepositoryCacheEntry>();

  /** Retrieve (or lazily create) the cache entry for a repository. */
  private static getEntry(repoRoot: string): RepositoryCacheEntry {
    let entry = this.cache.get(repoRoot);
    if (!entry) {
      entry = {};
      this.cache.set(repoRoot, entry);
    }
    return entry;
  }

  /** Return the existing entry without creating a new one.
   *  This is primarily for internal utilities that need to mutate the entry
   *  directly (e.g., invalidation helpers). Returns `undefined` when the
   *  repository has no cached data.
   */
  static getRawEntry(repoRoot: string): RepositoryCacheEntry | undefined {
    return this.cache.get(repoRoot);
  }

  // ---------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------
  static getMetadata(repoRoot: string): unknown | undefined {
    return this.getEntry(repoRoot).metadata;
  }

  static setMetadata(repoRoot: string, metadata: unknown): void {
    this.getEntry(repoRoot).metadata = metadata;
  }

  // ---------------------------------------------------------------------
  // Refs snapshot
  // ---------------------------------------------------------------------
  static getRefs(repoRoot: string): unknown | undefined {
    return this.getEntry(repoRoot).refs;
  }

  static setRefs(repoRoot: string, refs: unknown): void {
    this.getEntry(repoRoot).refs = refs;
  }

  // ---------------------------------------------------------------------
  // Commit pages (incremental loading)
  // ---------------------------------------------------------------------
  static getCommitPage(repoRoot: string, pageKey: string): unknown | undefined {
    const entry = this.getEntry(repoRoot).commitPages;
    return entry ? entry[pageKey] : undefined;
  }

  static setCommitPage(repoRoot: string, pageKey: string, data: unknown): void {
    const entry = this.getEntry(repoRoot);
    if (!entry.commitPages) entry.commitPages = {};
    entry.commitPages![pageKey] = data;
  }

  // ---------------------------------------------------------------------
  // Graph continuation state
  // ---------------------------------------------------------------------
  static getGraphContinuation(repoRoot: string): unknown | undefined {
    return this.getEntry(repoRoot).graphContinuation;
  }

  static setGraphContinuation(repoRoot: string, state: unknown): void {
    this.getEntry(repoRoot).graphContinuation = state;
  }

  // ---------------------------------------------------------------------
  // Commit details (single commit)
  // ---------------------------------------------------------------------
  static getCommitDetails(repoRoot: string, commitSha: string): unknown | undefined {
    const entry = this.getEntry(repoRoot).commitDetails;
    return entry ? entry[commitSha] : undefined;
  }

  static setCommitDetails(repoRoot: string, commitSha: string, details: unknown): void {
    const entry = this.getEntry(repoRoot);
    if (!entry.commitDetails) entry.commitDetails = {};
    entry.commitDetails![commitSha] = details;
  }

  // ---------------------------------------------------------------------
  // Diff metadata (short‑term)
  // ---------------------------------------------------------------------
  static getDiffMetadata(repoRoot: string): unknown | undefined {
    return this.getEntry(repoRoot).diffMetadata;
  }

  static setDiffMetadata(repoRoot: string, diff: unknown): void {
    this.getEntry(repoRoot).diffMetadata = diff;
  }

  // ---------------------------------------------------------------------
  // Invalidation utilities
  // ---------------------------------------------------------------------
  /** Remove all cached data for a repository. */
  static clear(repoRoot: string): void {
    this.cache.delete(repoRoot);
  }
}
