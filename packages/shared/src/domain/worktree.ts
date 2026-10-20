import { z } from 'zod';

export type WorktreeFileStatusCode =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'typeChanged'
  | 'unmerged'
  | 'untracked'
  | 'unknown';

export const WorktreeFileStatusCodeSchema = z.enum([
  'added',
  'modified',
  'deleted',
  'renamed',
  'copied',
  'typeChanged',
  'unmerged',
  'untracked',
  'unknown',
]);

export interface WorktreeFileChange {
  path: string;
  oldPath?: string;
  status: WorktreeFileStatusCode;
  /** Raw porcelain index status character (X). */
  indexStatus: string;
  /** Raw porcelain worktree status character (Y). */
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
}

export const WorktreeFileChangeSchema = z.object({
  path: z.string().min(1),
  oldPath: z.string().min(1).optional(),
  status: WorktreeFileStatusCodeSchema,
  indexStatus: z.string().length(1),
  worktreeStatus: z.string().length(1),
  staged: z.boolean(),
  unstaged: z.boolean(),
});

export interface WorktreeHeadCommit {
  sha: string;
  subject: string;
  body: string;
}

export const WorktreeHeadCommitSchema = z.object({
  sha: z.string().min(1),
  subject: z.string(),
  body: z.string(),
});

export interface WorktreeStatus {
  isClean: boolean;
  staged: WorktreeFileChange[];
  unstaged: WorktreeFileChange[];
  hasConflicts: boolean;
  head: WorktreeHeadCommit | null;
  currentBranch?: string;
}

export const WorktreeStatusSchema = z.object({
  isClean: z.boolean(),
  staged: z.array(WorktreeFileChangeSchema),
  unstaged: z.array(WorktreeFileChangeSchema),
  hasConflicts: z.boolean(),
  head: WorktreeHeadCommitSchema.nullable(),
  currentBranch: z.string().optional(),
});

export interface StashEntry {
  index: number;
  ref: string;
  sha: string;
  message: string;
  branch?: string;
  author?: string;
  timestamp?: number;
}

export const StashEntrySchema = z.object({
  index: z.number().int().nonnegative(),
  ref: z.string().min(1),
  sha: z.string().min(1),
  message: z.string(),
  branch: z.string().optional(),
  author: z.string().optional(),
  timestamp: z.number().int().nonnegative().optional(),
});
