import { z } from 'zod';

export type SubmoduleState = 'clean' | 'dirty' | 'uninitialized' | 'unknown';

export const SubmoduleStateSchema = z.enum(['clean', 'dirty', 'uninitialized', 'unknown']);

export interface SubmoduleInfo {
  name: string;
  path: string;
  url?: string;
  /** Commit recorded in the superproject's HEAD tree. */
  recordedSha?: string;
  /** Commit currently checked out inside the submodule worktree. */
  headSha?: string;
  state: SubmoduleState;
  /** Commits present in the submodule but not in the recorded SHA. */
  ahead?: number;
  /** Commits present in the recorded SHA but missing from the submodule. */
  behind?: number;
}

export const SubmoduleInfoSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  url: z.string().optional(),
  recordedSha: z.string().min(1).optional(),
  headSha: z.string().min(1).optional(),
  state: SubmoduleStateSchema,
  ahead: z.number().int().nonnegative().optional(),
  behind: z.number().int().nonnegative().optional(),
});

export interface SubmoduleListResult {
  submodules: SubmoduleInfo[];
}

export const SubmoduleListResultSchema = z.object({
  submodules: z.array(SubmoduleInfoSchema),
});
