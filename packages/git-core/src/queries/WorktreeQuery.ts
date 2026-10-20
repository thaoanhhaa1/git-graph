import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  StashEntry,
  WorktreeFileChange,
  WorktreeFileStatusCode,
  WorktreeHeadCommit,
  WorktreeStatus,
} from '@git-graph/shared';
import { GitCliClient } from '../client/GitCliClient';
import type { GitClient } from '../client/GitClient';

export interface WorktreeQueryDependencies {
  client?: GitClient;
}

export interface WorktreeDiscardOptions {
  paths: string[];
  all?: boolean;
}

export interface WorktreeCommitOptions {
  message: string;
  description?: string;
  amend?: boolean;
}

export interface WorktreeCommitResult {
  sha: string;
  subject: string;
  amended: boolean;
}

const UNMERGED_COMBINATIONS = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

function mapStatusCode(indexStatus: string, worktreeStatus: string): WorktreeFileStatusCode {
  if (indexStatus === '?' && worktreeStatus === '?') {
    return 'untracked';
  }
  if (UNMERGED_COMBINATIONS.has(`${indexStatus}${worktreeStatus}`)) {
    return 'unmerged';
  }

  const codes = [worktreeStatus, indexStatus];
  for (const code of codes) {
    switch (code) {
      case 'R':
        return 'renamed';
      case 'C':
        return 'copied';
      case 'A':
        return 'added';
      case 'D':
        return 'deleted';
      case 'T':
        return 'typeChanged';
      case 'M':
        return 'modified';
      default:
        break;
    }
  }

  return 'unknown';
}

/**
 * Parses `git status --porcelain=v1 -z -uall` output.
 * Rename/copy entries contain the destination path followed by the source path.
 */
export function parsePorcelainStatus(output: string): WorktreeFileChange[] {
  const entries: WorktreeFileChange[] = [];
  const tokens = output.split('\0');
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    index += 1;
    if (!token || token.length < 3) {
      continue;
    }

    const indexStatus = token[0] ?? ' ';
    const worktreeStatus = token[1] ?? ' ';
    const filePath = token.slice(3);
    if (!filePath) {
      continue;
    }

    const isRenameOrCopy = indexStatus === 'R' || indexStatus === 'C' || worktreeStatus === 'R';
    let oldPath: string | undefined;
    if (isRenameOrCopy) {
      const source = tokens[index];
      index += 1;
      if (source) {
        oldPath = source;
      }
    }

    const isUntracked = indexStatus === '?' && worktreeStatus === '?';
    entries.push({
      path: filePath,
      ...(oldPath ? { oldPath } : {}),
      status: mapStatusCode(indexStatus, worktreeStatus),
      indexStatus,
      worktreeStatus,
      staged: !isUntracked && indexStatus !== ' ',
      unstaged: isUntracked || worktreeStatus !== ' ',
    });
  }

  return entries;
}

/**
 * Queries and mutates the repository working tree and index.
 */
export class WorktreeQuery {
  private readonly _client: GitClient;

  public constructor(deps?: WorktreeQueryDependencies) {
    this._client = deps?.client ?? new GitCliClient();
  }

  public async getStatus(repoPath: string): Promise<WorktreeStatus> {
    const [statusResult, head, currentBranch] = await Promise.all([
      this._client.exec(['status', '--porcelain=v1', '-z', '-uall'], { cwd: repoPath }),
      this._readHead(repoPath),
      this._readCurrentBranch(repoPath),
    ]);

    const files = parsePorcelainStatus(statusResult.stdout);
    const staged = files.filter((file) => file.staged);
    const unstaged = files.filter((file) => file.unstaged);
    const hasConflicts = files.some(
      (file) =>
        file.status === 'unmerged' ||
        UNMERGED_COMBINATIONS.has(`${file.indexStatus}${file.worktreeStatus}`),
    );

    return {
      isClean: files.length === 0,
      staged,
      unstaged,
      hasConflicts,
      head,
      ...(currentBranch ? { currentBranch } : {}),
    };
  }

  public async stage(repoPath: string, paths: string[], all = false): Promise<void> {
    if (all) {
      await this._client.exec(['add', '-A', '--', '.'], { cwd: repoPath });
      return;
    }
    const safePaths = this._validatePaths(repoPath, paths);
    if (safePaths.length === 0) {
      return;
    }
    await this._client.exec(['add', '-A', '--', ...safePaths], { cwd: repoPath });
  }

  public async unstage(repoPath: string, paths: string[], all = false): Promise<void> {
    const safePaths = all ? ['.'] : this._validatePaths(repoPath, paths);
    if (safePaths.length === 0) {
      return;
    }

    try {
      await this._client.exec(['reset', '-q', 'HEAD', '--', ...safePaths], { cwd: repoPath });
    } catch (error) {
      // Unborn branch: there is no HEAD to reset to, so remove entries from the index directly.
      const head = await this._readHead(repoPath);
      if (head) {
        throw error;
      }
      await this._client.exec(
        ['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...safePaths],
        { cwd: repoPath },
      );
    }
  }

  public async discard(repoPath: string, options: WorktreeDiscardOptions): Promise<void> {
    const status = await this.getStatus(repoPath);
    const allFiles = [...status.staged, ...status.unstaged];
    const deduped = new Map<string, WorktreeFileChange>();
    for (const file of allFiles) {
      if (!deduped.has(file.path)) {
        deduped.set(file.path, file);
      }
    }

    let targets: WorktreeFileChange[];
    if (options.all) {
      targets = Array.from(deduped.values());
    } else {
      const requested = new Set(this._validatePaths(repoPath, options.paths));
      targets = Array.from(deduped.values()).filter((file) => requested.has(file.path));
    }

    if (targets.length === 0) {
      return;
    }

    const untrackedPaths: string[] = [];
    const addedPaths: string[] = [];
    const trackedPaths: string[] = [];

    for (const file of targets) {
      if (file.status === 'untracked') {
        untrackedPaths.push(file.path);
      } else if (file.indexStatus === 'A') {
        addedPaths.push(file.path);
      } else {
        trackedPaths.push(file.path);
      }
    }

    if (trackedPaths.length > 0) {
      try {
        await this._client.exec(
          ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...trackedPaths],
          { cwd: repoPath },
        );
      } catch (error) {
        const head = await this._readHead(repoPath);
        if (head) {
          throw error;
        }
        await this._client.exec(
          ['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...trackedPaths],
          { cwd: repoPath },
        );
        this._removeFiles(repoPath, trackedPaths);
      }
    }

    if (addedPaths.length > 0) {
      await this._client.exec(
        ['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...addedPaths],
        { cwd: repoPath },
      );
      this._removeFiles(repoPath, addedPaths);
    }

    if (untrackedPaths.length > 0) {
      this._removeFiles(repoPath, untrackedPaths);
    }
  }

  public async commit(
    repoPath: string,
    options: WorktreeCommitOptions,
  ): Promise<WorktreeCommitResult> {
    const message = options.message.trim();
    if (!message) {
      throw new Error('Commit message cannot be empty.');
    }

    const args = ['commit', '-m', message];
    const description = options.description?.trim();
    if (description) {
      args.push('-m', description);
    }
    if (options.amend) {
      args.push('--amend');
    }

    await this._client.exec(args, { cwd: repoPath });

    const sha = (await this._client.exec(['rev-parse', 'HEAD'], { cwd: repoPath })).stdout.trim();
    const subject = (
      await this._client.exec(['log', '-1', '--format=%s', 'HEAD'], { cwd: repoPath })
    ).stdout.trim();

    return {
      sha,
      subject,
      amended: Boolean(options.amend),
    };
  }

  private async _readHead(repoPath: string): Promise<WorktreeHeadCommit | null> {
    try {
      const result = await this._client.exec(['log', '-1', '--format=%H%x00%s%x00%b', 'HEAD'], {
        cwd: repoPath,
      });
      const [sha, subject = '', body = ''] = result.stdout.split('\0');
      if (!sha?.trim()) {
        return null;
      }
      return {
        sha: sha.trim(),
        subject: subject.trim(),
        body: body.trim(),
      };
    } catch {
      return null;
    }
  }

  private async _readCurrentBranch(repoPath: string): Promise<string | undefined> {
    try {
      const result = await this._client.exec(['symbolic-ref', '-q', '--short', 'HEAD'], {
        cwd: repoPath,
      });
      const branch = result.stdout.trim();
      return branch || undefined;
    } catch {
      return undefined;
    }
  }

  private _validatePaths(repoPath: string, paths: string[]): string[] {
    const root = path.resolve(repoPath);
    const result: string[] = [];

    for (const raw of paths) {
      const trimmed = raw.trim();
      if (!trimmed) {
        continue;
      }
      const absolute = path.resolve(root, trimmed);
      const relative = path.relative(root, absolute);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Refusing to operate on path outside the repository: ${raw}`);
      }
      result.push(relative.split(path.sep).join('/'));
    }

    return Array.from(new Set(result));
  }

  private _removeFiles(repoPath: string, paths: string[]): void {
    const root = path.resolve(repoPath);
    for (const relative of paths) {
      const absolute = path.resolve(root, relative);
      const check = path.relative(root, absolute);
      if (check.startsWith('..') || path.isAbsolute(check)) {
        continue;
      }
      fs.rmSync(absolute, { recursive: true, force: true });
    }
  }
}

/**
 * Queries and mutates Git stashes.
 */
export class StashQuery {
  private readonly _client: GitClient;

  public constructor(deps?: WorktreeQueryDependencies) {
    this._client = deps?.client ?? new GitCliClient();
  }

  public async list(repoPath: string): Promise<StashEntry[]> {
    const result = await this._client.exec(
      ['stash', 'list', '--format=%gd%x00%H%x00%gs%x00%an%x00%at'],
      { cwd: repoPath },
    );

    const entries: StashEntry[] = [];
    const lines = result.stdout.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const [ref, sha, message, author, timestamp] = trimmed.split('\0');
      if (!ref || !sha) {
        continue;
      }
      const indexMatch = /stash@\{(\d+)\}/.exec(ref);
      const index = indexMatch?.[1] ? parseInt(indexMatch[1], 10) : entries.length;
      const parsedTimestamp = timestamp ? parseInt(timestamp, 10) : NaN;
      const branch = this._extractBranch(message ?? '');

      entries.push({
        index,
        ref,
        sha,
        message: message ?? '',
        ...(branch ? { branch } : {}),
        ...(author ? { author } : {}),
        ...(Number.isFinite(parsedTimestamp) ? { timestamp: parsedTimestamp * 1000 } : {}),
      });
    }

    return entries;
  }

  public async save(
    repoPath: string,
    options: { message?: string; includeUntracked?: boolean; keepIndex?: boolean } = {},
  ): Promise<void> {
    const args = ['stash', 'push'];
    if (options.includeUntracked) {
      args.push('--include-untracked');
    }
    if (options.keepIndex) {
      args.push('--keep-index');
    }
    const message = options.message?.trim();
    if (message) {
      args.push('-m', message);
    }
    await this._client.exec(args, { cwd: repoPath });
  }

  public async pop(repoPath: string, index: number): Promise<void> {
    await this._client.exec(['stash', 'pop', this._formatRef(index)], { cwd: repoPath });
  }

  public async apply(repoPath: string, index: number): Promise<void> {
    await this._client.exec(['stash', 'apply', this._formatRef(index)], { cwd: repoPath });
  }

  public async drop(repoPath: string, index: number): Promise<void> {
    await this._client.exec(['stash', 'drop', this._formatRef(index)], { cwd: repoPath });
  }

  private _formatRef(index: number): string {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Invalid stash index: ${index}`);
    }
    return `stash@{${index}}`;
  }

  private _extractBranch(message: string): string | undefined {
    const wipMatch = /^WIP on ([^:]+):/.exec(message);
    if (wipMatch?.[1]) {
      return wipMatch[1];
    }
    const onMatch = /^On ([^:]+):/.exec(message);
    if (onMatch?.[1]) {
      return onMatch[1];
    }
    return undefined;
  }
}
