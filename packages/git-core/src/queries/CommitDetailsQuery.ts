import type { Commit, CommitDetails } from '@git-graph/shared';
import { GitCliClient } from '../client/GitCliClient';
import { GitCommandMaxBufferBytes, GitCommandTimeoutMs } from '../client/GitExecutionDefaults';
import type { GitClient } from '../client/GitClient';
import { CommitLogParser } from '../parsers/CommitLogParser';
import { DiffStatParser } from '../parsers/DiffStatParser';

export interface CommitDetailsQueryOptions {
  /**
   * For merge commits (or arbitrary comparisons), specify which parent commit SHA to compare against.
   * If not specified for a merge commit, the first parent (sha^1) is compared by default.
   */
  parentSha?: string;

  /**
   * Base commit SHA for arbitrary range comparisons (Commit A - older).
   */
  baseSha?: string;

  /**
   * Target commit SHA for arbitrary range comparisons (Commit B - newer).
   */
  targetSha?: string;

  /**
   * List of known remote names to classify remote tracking branches.
   */
  knownRemotes?: string[];
}

export interface CommitDetailsQueryDependencies {
  client?: GitClient;
}

/**
 * Queries full commit metadata, full body, refs, changed files, and diff statistics.
 */
export class CommitDetailsQuery {
  private readonly _client: GitClient;

  public constructor(deps?: CommitDetailsQueryDependencies) {
    this._client = deps?.client ?? new GitCliClient();
  }

  /**
   * Queries complete commit details including file changes, status, and additions/deletions.
   * Supports normal commits, root commits (empty tree comparison), and merge commits (with parent selection).
   */
  public async queryDetails(
    repoPath: string,
    sha: string,
    options?: CommitDetailsQueryOptions,
  ): Promise<CommitDetails | null> {
    const cleanSha = options?.targetSha?.trim() || sha?.trim();
    if (!cleanSha) {
      return null;
    }

    // 1. Fetch full commit metadata and message body
    const logArgs = ['log', '-1', `--pretty=format:${CommitLogParser.DETAILS_FORMAT}`, cleanSha];
    let commit: Commit | null = null;

    try {
      const logResult = await this._client.exec(logArgs, {
        cwd: repoPath,
        timeoutMs: GitCommandTimeoutMs.fast,
        maxBufferBytes: GitCommandMaxBufferBytes.small,
      });
      if (logResult.exitCode !== 0 || !logResult.stdout.trim()) {
        return null;
      }
      const commits = CommitLogParser.parseLog(logResult.stdout, options?.knownRemotes);
      commit = commits[0] ?? null;
    } catch {
      return null;
    }

    if (!commit) {
      return null;
    }

    // 2. Determine comparison target
    const isRootCommit = commit.parents.length === 0;
    const isMergeCommit = commit.parents.length > 1;
    const compareParentSha =
      options?.baseSha?.trim() ||
      options?.parentSha?.trim() ||
      (isMergeCommit ? commit.parents[0] : undefined);

    let numstatArgs: string[];
    let nameStatusArgs: string[];
    let rawDiffArgs: string[];

    if (compareParentSha) {
      // Comparison against specified parent (or merge commit parent 1)
      numstatArgs = ['diff', '-M', '-C', '--numstat', compareParentSha, cleanSha];
      nameStatusArgs = ['diff', '-M', '-C', '--name-status', compareParentSha, cleanSha];
      rawDiffArgs = ['diff', '-M', '-C', '--raw', compareParentSha, cleanSha];
    } else if (isRootCommit) {
      // Root commit diff compared against empty tree
      numstatArgs = [
        'diff-tree',
        '-r',
        '--root',
        '--no-commit-id',
        '-M',
        '-C',
        '--numstat',
        cleanSha,
      ];
      nameStatusArgs = [
        'diff-tree',
        '-r',
        '--root',
        '--no-commit-id',
        '-M',
        '-C',
        '--name-status',
        cleanSha,
      ];
      rawDiffArgs = ['diff-tree', '-r', '--root', '--no-commit-id', '-M', '-C', '--raw', cleanSha];
    } else {
      // Standard single-parent commit
      numstatArgs = ['diff-tree', '-r', '--no-commit-id', '-M', '-C', '--numstat', cleanSha];
      nameStatusArgs = ['diff-tree', '-r', '--no-commit-id', '-M', '-C', '--name-status', cleanSha];
      rawDiffArgs = ['diff-tree', '-r', '--no-commit-id', '-M', '-C', '--raw', cleanSha];
    }

    try {
      const [numstatResult, nameStatusResult, rawDiffResult] = await Promise.all([
        this._client.exec(numstatArgs, {
          cwd: repoPath,
          timeoutMs: GitCommandTimeoutMs.fast,
          maxBufferBytes: GitCommandMaxBufferBytes.small,
        }),
        this._client.exec(nameStatusArgs, {
          cwd: repoPath,
          timeoutMs: GitCommandTimeoutMs.fast,
          maxBufferBytes: GitCommandMaxBufferBytes.small,
        }),
        this._client.exec(rawDiffArgs, {
          cwd: repoPath,
          timeoutMs: GitCommandTimeoutMs.fast,
          maxBufferBytes: GitCommandMaxBufferBytes.small,
        }),
      ]);

      const numstatStdout = numstatResult.exitCode === 0 ? numstatResult.stdout : '';
      const nameStatusStdout = nameStatusResult.exitCode === 0 ? nameStatusResult.stdout : '';
      const rawDiffStdout = rawDiffResult.exitCode === 0 ? rawDiffResult.stdout : '';

      const numstatEntries = DiffStatParser.parseNumstat(numstatStdout);
      const submodulePaths = new Set(
        DiffStatParser.parseRawDiff(rawDiffStdout)
          .filter((entry) => entry.isSubmodule)
          .map((entry) => entry.path),
      );
      const nameStatusEntries = DiffStatParser.parseNameStatus(nameStatusStdout).map((entry) =>
        submodulePaths.has(entry.path) ? { ...entry, isSubmodule: true } : entry,
      );
      const fileChanges = DiffStatParser.combine(numstatEntries, nameStatusEntries);
      const stats = DiffStatParser.computeStats(fileChanges);

      if (compareParentSha) {
        try {
          const countRes = await this._client.exec(
            ['rev-list', '--count', `${compareParentSha}..${cleanSha}`],
            {
              cwd: repoPath,
              timeoutMs: GitCommandTimeoutMs.fast,
              maxBufferBytes: GitCommandMaxBufferBytes.small,
            },
          );
          if (countRes.exitCode === 0) {
            const parsed = parseInt(countRes.stdout.trim(), 10);
            if (!Number.isNaN(parsed)) {
              stats.commitCount = parsed;
              commit.commitCount = parsed;
            }
          }
        } catch {
          // Non-fatal fallback
        }
      }

      // Attach fileChanges and stats to commit object for compatibility
      commit.fileChanges = fileChanges;
      commit.stats = stats;

      return {
        commit,
        fileChanges,
        stats,
      };
    } catch {
      // If diff inspection fails, still return commit metadata with empty file changes
      const emptyStats = { filesChanged: 0, additions: 0, deletions: 0 };
      commit.fileChanges = [];
      commit.stats = emptyStats;

      return {
        commit,
        fileChanges: [],
        stats: emptyStats,
      };
    }
  }
}
