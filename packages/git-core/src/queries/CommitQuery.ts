import {
  clampPageSize,
  type Commit,
  type CommitPage,
  type CommitOrdering,
} from '@git-graph/shared';
import { GitCommandError } from '../client/GitCommandError';
import { GitCliClient } from '../client/GitCliClient';
import { GitCommandMaxBufferBytes, GitCommandTimeoutMs } from '../client/GitExecutionDefaults';
import type { GitClient } from '../client/GitClient';
import { CommitLogParser } from '../parsers/CommitLogParser';

/**
 * Filter and pagination options for querying commit history.
 */
export interface CommitQueryOptions {
  /**
   * Maximum number of commits to return.
   * Default: 500 (safe limit bounds: 10 - 2000).
   */
  limit?: number;

  /**
   * AbortSignal to cancel query execution when repository/filter changes.
   */
  signal?: AbortSignal;

  /**
   * Cursor for pagination.
   * In this MVP, cursor represents the numeric skip offset (e.g., "50", "100").
   *
   * LIMITATION NOTE:
   * Pagination based on numeric skip offset assumes a stable Git history during traversal.
   * If new commits are introduced or history is rewritten (rebase, reset, branch deletion)
   * between page requests, commit offsets can shift, potentially causing duplicates or
   * skipped commits across page boundaries.
   */
  cursor?: string;

  /**
   * Filter commits reachable from a specific ref (e.g., 'main', 'origin/feat', 'HEAD').
   */
  ref?: string;

  /**
   * Filter commits reachable from an array of refs.
   */
  refs?: string[];

  /**
   * Whether to include all refs. Default is true if neither `ref` nor `refs` is specified.
   */
  all?: boolean;

  /**
   * Commit ordering strategy: 'date-order' | 'topo-order' | 'author-date-order'.
   * Default: 'date-order'.
   */
  order?: CommitOrdering;

  /**
   * Order commits by date order. Default is true (--date-order).
   * Kept for backwards compatibility. If `order` is provided, `order` takes precedence.
   */
  dateOrder?: boolean;

  /**
   * Filter commits by author name or email pattern (--author).
   */
  author?: string;

  /**
   * Filter commits by date range (--after and --before).
   */
  dateRange?: {
    since?: Date | string | number;
    until?: Date | string | number;
  };

  /**
   * Search query to filter commit messages or authors (--grep / --author).
   */
  textQuery?: string;

  /**
   * Specific search type for textQuery: 'all' | 'subject' | 'author' | 'hash' | 'ref'.
   * Default: 'all'.
   */
  searchType?: 'all' | 'subject' | 'author' | 'hash' | 'ref';

  /**
   * Path filter to show only commits touching a specific file or directory.
   */
  path?: string;

  /**
   * List of known remote names to classify remote tracking branches in decorations.
   */
  knownRemotes?: string[];
}

export interface CommitQueryDependencies {
  client?: GitClient;
}

/**
 * Encodes a numeric skip offset into a cursor string.
 */
export function encodeCursor(skip: number): string {
  return String(Math.max(0, skip));
}

/**
 * Decodes a cursor string into a numeric skip offset.
 */
export function decodeCursor(cursor?: string): number {
  if (!cursor) {
    return 0;
  }
  const parsed = Number.parseInt(cursor, 10);
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

/**
 * Formats a Date, string, or timestamp into an ISO string acceptable by git log --after / --before.
 */
export function formatGitDate(date: Date | string | number): string {
  if (date instanceof Date) {
    return date.toISOString();
  }
  if (typeof date === 'number') {
    const ms = date < 1e11 ? date * 1000 : date;
    return new Date(ms).toISOString();
  }
  return date;
}

/**
 * Executes git log queries with optimized formatting, pagination, and filtering.
 */
export class CommitQuery {
  private readonly _client: GitClient;

  public constructor(deps?: CommitQueryDependencies) {
    this._client = deps?.client ?? new GitCliClient();
  }

  /**
   * Queries a page of commit metadata without loading heavy bodies or diffs.
   */
  public async queryCommits(repoPath: string, options?: CommitQueryOptions): Promise<CommitPage> {
    if (options?.signal?.aborted) {
      return { commits: [], hasMore: false };
    }
    const limit = clampPageSize(options?.limit);
    const skip = decodeCursor(options?.cursor);

    const args: string[] = ['log'];

    // Ordering
    const order = options?.order ?? (options?.dateOrder === false ? undefined : 'date-order');
    if (order === 'topo-order') {
      args.push('--topo-order');
    } else if (order === 'author-date-order') {
      args.push('--author-date-order');
    } else if (order === 'date-order') {
      args.push('--date-order');
    }

    // Refs
    if (options?.ref) {
      args.push(options.ref);
    } else if (options?.refs && options.refs.length > 0) {
      args.push(...options.refs);
    } else {
      args.push('--all');
    }

    // Pagination: query limit + 1 to detect whether more pages exist
    args.push(`-n${limit + 1}`);
    if (skip > 0) {
      args.push(`--skip=${skip}`);
    }

    // Filters
    if (options?.author) {
      args.push(`--author=${options.author}`);
    }

    if (options?.dateRange?.since) {
      args.push(`--after=${formatGitDate(options.dateRange.since)}`);
    }

    if (options?.dateRange?.until) {
      args.push(`--before=${formatGitDate(options.dateRange.until)}`);
    }

    if (options?.textQuery) {
      const q = options.textQuery.trim();
      if (options.searchType === 'author') {
        args.push(`--author=${q}`, '-i');
      } else if (options.searchType === 'subject') {
        args.push(`--grep=${q}`, '-i');
      } else if (options.searchType === 'ref') {
        args.push(`--glob=refs/*${q}*`);
      } else if (options.author) {
        // If an explicit author filter is already set, search subject
        args.push(`--grep=${q}`, '-i');
      } else {
        // Default 'all': search both subject and author (git log evaluates multiple criteria with OR by default)
        args.push(`--grep=${q}`, `--author=${q}`, '-i');
      }
    }

    // Custom pretty format using control characters
    args.push(`--pretty=format:${CommitLogParser.METADATA_FORMAT}`);

    // Path filter
    if (options?.path) {
      args.push('--', options.path);
    }

    try {
      const result = await this._client.exec(args, {
        cwd: repoPath,
        signal: options?.signal,
        timeoutMs: GitCommandTimeoutMs.long,
        maxBufferBytes: GitCommandMaxBufferBytes.large,
      });

      if (result.exitCode !== 0) {
        // Return empty page if repository has no commits yet
        if (
          result.stderr.includes('does not have any commits') ||
          result.stderr.includes('unknown revision') ||
          result.stderr.includes('fatal: bad default revision')
        ) {
          return { commits: [], hasMore: false };
        }
        throw new Error(
          `Git log command failed with exit code ${result.exitCode}: ${result.stderr}`,
        );
      }

      const parsedCommits = CommitLogParser.parseLog(result.stdout, options?.knownRemotes);

      if (parsedCommits.length > limit) {
        const commits = parsedCommits.slice(0, limit);
        const nextCursor = encodeCursor(skip + limit);
        return {
          commits,
          cursor: nextCursor,
          hasMore: true,
        };
      }

      return {
        commits: parsedCommits,
        hasMore: false,
      };
    } catch (error) {
      if (options?.signal?.aborted || (error instanceof GitCommandError && error.isCancelled)) {
        return { commits: [], hasMore: false };
      }
      // If error message indicates no commits in newly initialized repository
      if (
        error instanceof Error &&
        (error.message.includes('does not have any commits') ||
          error.message.includes('fatal: bad default revision'))
      ) {
        return { commits: [], hasMore: false };
      }
      throw error;
    }
  }

  /**
   * Queries full commit details (including full commit message body).
   */
  public async getCommitDetails(
    repoPath: string,
    sha: string,
    knownRemotes?: string[],
  ): Promise<Commit | null> {
    const args = ['log', '-1', `--pretty=format:${CommitLogParser.DETAILS_FORMAT}`, sha];

    try {
      const result = await this._client.exec(args, { cwd: repoPath });
      if (result.exitCode !== 0) {
        return null;
      }
      const commits = CommitLogParser.parseLog(result.stdout, knownRemotes);
      return commits[0] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves the raw full commit body for a given commit SHA.
   */
  public async getCommitBody(repoPath: string, sha: string): Promise<string | null> {
    const args = ['log', '-1', '--pretty=format:%B', sha];

    try {
      const result = await this._client.exec(args, { cwd: repoPath });
      if (result.exitCode !== 0) {
        return null;
      }
      return result.stdout;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves the diff for a given commit.
   * If parentSha is provided, produces diff against that parent; otherwise produces commit patch.
   */
  public async getCommitDiff(repoPath: string, sha: string, parentSha?: string): Promise<string> {
    const args = parentSha ? ['diff', parentSha, sha] : ['show', '--format=', sha];

    const result = await this._client.exec(args, {
      cwd: repoPath,
      timeoutMs: GitCommandTimeoutMs.fast,
      maxBufferBytes: GitCommandMaxBufferBytes.small,
    });
    if (result.exitCode !== 0) {
      throw new Error(`Git diff failed with exit code ${result.exitCode}: ${result.stderr}`);
    }
    return result.stdout;
  }

  /**
   * Searches commits across the repository matching query in subject, author, ref, or hash.
   */
  public async searchCommits(
    repoPath: string,
    query: string,
    options?: CommitQueryOptions,
  ): Promise<Commit[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    // 1. If query looks like a full or partial commit hash (4-40 hex chars), attempt direct commit resolution
    let hashCommit: Commit | null = null;
    if (/^[0-9a-fA-F]{4,40}$/.test(trimmed)) {
      try {
        hashCommit = await this.getCommitDetails(repoPath, trimmed, options?.knownRemotes);
      } catch {
        // Not a valid commit hash or not found
      }
    }

    // 2. Query commits matching criteria
    const pageResult = await this.queryCommits(repoPath, {
      ...options,
      textQuery: trimmed,
      searchType: options?.searchType ?? 'all',
      limit: options?.limit ?? 50,
    });

    const commits = [...pageResult.commits];

    // If a commit was found by hash and isn't already in results, prepend it
    if (hashCommit && !commits.some((c) => c.sha === hashCommit!.sha)) {
      commits.unshift(hashCommit);
    }

    return commits;
  }
}
