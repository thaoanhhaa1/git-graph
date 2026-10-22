import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GitWorktreeInfo } from '@git-graph/shared';
import { GitCliClient } from '../client/GitCliClient';
import type { GitClient } from '../client/GitClient';

export interface GitWorktreeQueryDependencies {
  client?: GitClient;
}

export interface GitWorktreeAddOptions {
  path: string;
  branch?: string;
  newBranch?: string;
}

function normalizeForComparison(value: string): string {
  let resolved = path.resolve(value);
  try {
    resolved = fs.realpathSync(resolved);
  } catch {
    // Keep the resolved path when the target does not exist yet.
  }
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Parses `git worktree list --porcelain` output into structured worktree entries.
 */
export function parseWorktreeList(
  output: string,
  currentRepositoryPath?: string,
): GitWorktreeInfo[] {
  const worktrees: GitWorktreeInfo[] = [];
  const currentPath = currentRepositoryPath
    ? normalizeForComparison(currentRepositoryPath)
    : undefined;
  let current: Partial<GitWorktreeInfo> | undefined;

  const flush = () => {
    if (!current?.path) {
      current = undefined;
      return;
    }

    const info: GitWorktreeInfo = {
      path: current.path,
      ...(current.branch ? { branch: current.branch } : {}),
      ...(current.headSha ? { headSha: current.headSha } : {}),
      ...(current.isDetached ? { isDetached: true } : {}),
      ...(current.isBare ? { isBare: true } : {}),
      ...(current.isLocked ? { isLocked: true } : {}),
      ...(current.lockReason ? { lockReason: current.lockReason } : {}),
      ...(current.isPrunable ? { isPrunable: true } : {}),
      ...(current.prunableReason ? { prunableReason: current.prunableReason } : {}),
    };

    if (currentPath && normalizeForComparison(info.path) === currentPath) {
      info.isCurrent = true;
    }

    worktrees.push(info);
    current = undefined;
  };

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      flush();
      continue;
    }

    const separator = line.indexOf(' ');
    const key = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? '' : line.slice(separator + 1);

    switch (key) {
      case 'worktree': {
        flush();
        current = { path: value };
        break;
      }
      case 'HEAD':
        if (!current) current = {};
        current.headSha = value;
        break;
      case 'branch': {
        if (!current) current = {};
        const short = value.replace(/^refs\/heads\//, '');
        current.branch = short || value;
        break;
      }
      case 'detached':
        if (!current) current = {};
        current.isDetached = true;
        break;
      case 'bare':
        if (!current) current = {};
        current.isBare = true;
        break;
      case 'locked':
        if (!current) current = {};
        current.isLocked = true;
        if (value) current.lockReason = value;
        break;
      case 'prunable':
        if (!current) current = {};
        current.isPrunable = true;
        if (value) current.prunableReason = value;
        break;
      default:
        break;
    }
  }

  flush();
  return worktrees;
}

function validateRefName(value: string, label: string): string {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.startsWith('-') ||
    Array.from(trimmed).some((char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return /\s/.test(char) || codePoint <= 31 || codePoint === 127;
    })
  ) {
    throw new Error(`${label} is not a valid branch name.`);
  }
  return trimmed;
}

/**
 * Queries and mutates linked Git worktrees (`git worktree`).
 */
export class GitWorktreeQuery {
  private readonly _client: GitClient;

  public constructor(deps?: GitWorktreeQueryDependencies) {
    this._client = deps?.client ?? new GitCliClient();
  }

  public async list(repoPath: string): Promise<GitWorktreeInfo[]> {
    const result = await this._client.exec(['worktree', 'list', '--porcelain'], { cwd: repoPath });
    return parseWorktreeList(result.stdout, repoPath);
  }

  public async add(repoPath: string, options: GitWorktreeAddOptions): Promise<GitWorktreeInfo[]> {
    const targetPath = options.path.trim();
    if (!targetPath) {
      throw new Error('Worktree path is required.');
    }

    const resolvedPath = path.resolve(repoPath, targetPath);
    const branch = options.branch ? validateRefName(options.branch, 'Worktree branch') : undefined;
    const newBranch = options.newBranch
      ? validateRefName(options.newBranch, 'New worktree branch')
      : undefined;

    const args = ['worktree', 'add'];
    if (newBranch) {
      args.push('-b', newBranch);
    }
    args.push('--', resolvedPath);
    if (branch) {
      args.push(branch);
    }

    await this._client.exec(args, { cwd: repoPath });
    return this.list(repoPath);
  }

  public async remove(
    repoPath: string,
    worktreePath: string,
    force = false,
  ): Promise<GitWorktreeInfo[]> {
    const trimmed = worktreePath.trim();
    if (!trimmed) {
      throw new Error('Worktree path is required.');
    }

    const resolvedPath = path.resolve(repoPath, trimmed);
    const worktrees = await this.list(repoPath);
    const target = worktrees.find(
      (worktree) => normalizeForComparison(worktree.path) === normalizeForComparison(resolvedPath),
    );
    if (!target) {
      throw new Error(`No linked worktree found at '${resolvedPath}'.`);
    }
    if (target.isCurrent) {
      throw new Error('Refusing to remove the worktree currently in use.');
    }

    const args = ['worktree', 'remove'];
    if (force) {
      args.push('--force');
    }
    args.push('--', target.path);
    await this._client.exec(args, { cwd: repoPath });
    return this.list(repoPath);
  }
}
