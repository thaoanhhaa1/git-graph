import { z } from 'zod';

/**
 * Describes a linked Git worktree as reported by `git worktree list --porcelain`.
 * Distinct from {@link WorktreeStatus}, which models the working tree/index state
 * of a single repository.
 */
export interface GitWorktreeInfo {
  /** Absolute path to the worktree root. */
  path: string;
  /** Short branch checked out in the worktree, when not detached. */
  branch?: string;
  /** Commit SHA currently checked out in the worktree. */
  headSha?: string;
  /** True when HEAD is detached in this worktree. */
  isDetached?: boolean;
  /** True for bare entries. */
  isBare?: boolean;
  /** True when this is the worktree the query was executed from. */
  isCurrent?: boolean;
  /** True when the worktree is locked. */
  isLocked?: boolean;
  lockReason?: string;
  /** True when Git considers the worktree prunable. */
  isPrunable?: boolean;
  prunableReason?: string;
}

export const GitWorktreeInfoSchema = z.object({
  path: z.string().min(1),
  branch: z.string().min(1).optional(),
  headSha: z.string().min(1).optional(),
  isDetached: z.boolean().optional(),
  isBare: z.boolean().optional(),
  isCurrent: z.boolean().optional(),
  isLocked: z.boolean().optional(),
  lockReason: z.string().optional(),
  isPrunable: z.boolean().optional(),
  prunableReason: z.string().optional(),
});

export interface GitWorktreeListResult {
  worktrees: GitWorktreeInfo[];
  currentPath?: string;
}

export const GitWorktreeListResultSchema = z.object({
  worktrees: z.array(GitWorktreeInfoSchema),
  currentPath: z.string().min(1).optional(),
});
