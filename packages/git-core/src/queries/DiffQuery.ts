import type { DiffResult } from '@git-graph/shared';
import { GitCliClient } from '../client/GitCliClient';
import { GitCommandMaxBufferBytes, GitCommandTimeoutMs } from '../client/GitExecutionDefaults';
import type { GitClient } from '../client/GitClient';

export interface DiffQueryOptions {
  /**
   * Commit SHA to inspect.
   */
  sha: string;

  /**
   * Specific parent SHA to compare against.
   * If not provided:
   * - Root commits compare against the empty tree (--root)
   * - Normal commits compare against their parent
   * - Merge commits compare against their first parent
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
   * Optional file path filter to query the diff for a single file.
   */
  filePath?: string;

  /**
   * Maximum allowed diff size in bytes before truncating.
   * Default: 1 MB (1,048,576 bytes).
   */
  maxBytes?: number;
}

export interface WorktreeDiffQueryOptions {
  /**
   * File path to diff. When omitted, the whole working tree is diffed.
   */
  filePath?: string;

  /**
   * When true, compares HEAD against the index (staged changes).
   * When false, compares HEAD against the working tree.
   */
  staged?: boolean;

  /**
   * Whether the file is untracked. Untracked files are diffed against the empty tree.
   */
  untracked?: boolean;

  /**
   * Maximum allowed diff size in bytes before truncating.
   */
  maxBytes?: number;
}

export interface DiffQueryDependencies {
  client?: GitClient;
}

export const DEFAULT_MAX_DIFF_BYTES = 1024 * 1024; // 1 MB

/**
 * Executes Git diff queries with root commit, merge parent, file path,
 * size truncation, and binary file handling.
 */
export class DiffQuery {
  private readonly _client: GitClient;

  public constructor(deps?: DiffQueryDependencies) {
    this._client = deps?.client ?? new GitCliClient();
  }

  /**
   * Queries the diff patch for a commit or a specific changed file.
   */
  public async queryDiff(repoPath: string, options: DiffQueryOptions): Promise<DiffResult> {
    const targetSha = options.targetSha?.trim() || options.sha?.trim();
    if (!targetSha) {
      return {
        diff: '',
        isTruncated: false,
        isBinary: false,
        totalBytes: 0,
      };
    }

    const maxBytes = options.maxBytes ?? DEFAULT_MAX_DIFF_BYTES;
    let parentSha = options.baseSha?.trim() || options.parentSha?.trim();
    let isRoot = false;

    // If no parentSha is specified, determine whether this is a root commit or merge commit
    if (!parentSha) {
      try {
        const revResult = await this._client.exec(['rev-list', '--parents', '-n', '1', targetSha], {
          cwd: repoPath,
          timeoutMs: GitCommandTimeoutMs.fast,
          maxBufferBytes: GitCommandMaxBufferBytes.small,
        });
        if (revResult.exitCode === 0) {
          const parts = revResult.stdout.trim().split(/\s+/).filter(Boolean);
          if (parts.length <= 1) {
            isRoot = true;
          } else {
            // For merge commits or standard commits, compare against parent 1
            parentSha = parts[1];
          }
        }
      } catch {
        // Fall back to standard diff behavior
      }
    }

    const args: string[] = [];

    if (isRoot) {
      args.push('diff-tree', '-p', '--root', '-r', '--no-commit-id', '-M', '-C', targetSha);
    } else if (parentSha) {
      args.push('diff', '-p', '-M', '-C', parentSha, targetSha);
    } else {
      args.push('diff-tree', '-p', '-r', '--no-commit-id', '-M', '-C', targetSha);
    }

    if (options.filePath) {
      args.push('--', options.filePath);
    }

    const result = await this._client.exec(args, {
      cwd: repoPath,
      timeoutMs: GitCommandTimeoutMs.normal,
      maxBufferBytes: Math.max(maxBytes * 2, GitCommandMaxBufferBytes.small),
    });

    if (result.exitCode !== 0) {
      throw new Error(`Git diff failed with exit code ${result.exitCode}: ${result.stderr}`);
    }

    return this._finalizeDiff(result.stdout, maxBytes, Boolean(options.filePath));
  }

  /**
   * Queries the diff between HEAD and the working tree (unstaged) or the index (staged).
   * Untracked files are compared against the empty tree.
   */
  public async queryWorktreeDiff(
    repoPath: string,
    options: WorktreeDiffQueryOptions,
  ): Promise<DiffResult> {
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_DIFF_BYTES;
    const args: string[] = ['diff', '--no-color', '--no-ext-diff'];

    if (options.staged) {
      args.push('--cached');
    }

    if (options.untracked && !options.staged) {
      args.push('--no-index', '--', '/dev/null', options.filePath ?? '.');
    } else {
      args.push('HEAD', '--');
      if (options.filePath) {
        args.push(options.filePath);
      }
    }

    const result = await this._client.exec(args, {
      cwd: repoPath,
      timeoutMs: GitCommandTimeoutMs.normal,
      maxBufferBytes: Math.max(maxBytes * 2, GitCommandMaxBufferBytes.small),
    });

    if (result.exitCode !== 0 && result.exitCode !== 1) {
      throw new Error(`Git diff failed with exit code ${result.exitCode}: ${result.stderr}`);
    }

    return this._finalizeDiff(result.stdout, maxBytes, Boolean(options.filePath));
  }

  private _finalizeDiff(rawDiff: string, maxBytes: number, isSingleFile: boolean): DiffResult {
    const totalBytes = Buffer.byteLength(rawDiff, 'utf8');

    // 1. Binary file detection
    const hasBinaryMarker =
      rawDiff.includes('Binary files ') ||
      rawDiff.includes('GIT binary patch') ||
      rawDiff.includes('\0');

    const hasTextHunks = rawDiff.includes('@@');
    const isSingleFileBinary = isSingleFile && hasBinaryMarker;
    const isPurelyBinaryDiff = hasBinaryMarker && !hasTextHunks;

    if (isSingleFileBinary || isPurelyBinaryDiff) {
      return {
        diff: 'Binary files differ. Binary file diff is not displayed in text view.',
        isTruncated: false,
        isBinary: true,
        totalBytes,
      };
    }

    // 2. Truncation handling if size exceeds maxBytes
    if (totalBytes > maxBytes) {
      // Find clean cutoff at last newline within byte limit
      let truncatedSlice = rawDiff.slice(0, maxBytes);
      const lastNewline = truncatedSlice.lastIndexOf('\n');
      if (lastNewline > 0) {
        truncatedSlice = truncatedSlice.slice(0, lastNewline);
      }

      const truncatedDiff =
        truncatedSlice +
        `\n\n... [Diff truncated: exceeded maximum display limit of ${(maxBytes / 1024).toFixed(0)} KB] ...\n`;

      return {
        diff: truncatedDiff,
        isTruncated: true,
        isBinary: false,
        truncatedBytes: Buffer.byteLength(truncatedDiff, 'utf8'),
        totalBytes,
      };
    }

    return {
      diff: rawDiff,
      isTruncated: false,
      isBinary: false,
      totalBytes,
    };
  }
}
