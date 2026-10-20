import { z } from 'zod';
import { CommitSchema, type Commit } from './commit';

export type FileChangeStatus =
  'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'typeChanged' | 'unmerged' | 'unknown';

export const FileChangeStatusSchema = z.enum([
  'added',
  'modified',
  'deleted',
  'renamed',
  'copied',
  'typeChanged',
  'unmerged',
  'unknown',
]);

export interface FileChange {
  path: string;
  oldPath?: string;
  status: FileChangeStatus;
  additions?: number;
  deletions?: number;
  isBinary: boolean;
  similarity?: number;
}

export const FileChangeSchema = z.object({
  path: z.string().min(1),
  oldPath: z.string().optional(),
  status: FileChangeStatusSchema,
  additions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
  isBinary: z.boolean(),
  similarity: z.number().min(0).max(100).optional(),
});

export interface CommitStats {
  filesChanged: number;
  additions: number;
  deletions: number;
  commitCount?: number;
}

export const CommitStatsSchema = z.object({
  filesChanged: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  commitCount: z.number().int().nonnegative().optional(),
});

export interface CommitDetails {
  commit: Commit;
  fileChanges: FileChange[];
  stats: CommitStats;
}

export const CommitDetailsSchema = z.object({
  commit: z.lazy(() => CommitSchema),
  fileChanges: z.array(FileChangeSchema),
  stats: CommitStatsSchema,
});

export interface DiffResult {
  diff: string;
  isTruncated: boolean;
  isBinary: boolean;
  truncatedBytes?: number;
  totalBytes?: number;
}

export const DiffResultSchema = z.object({
  diff: z.string(),
  isTruncated: z.boolean(),
  isBinary: z.boolean(),
  truncatedBytes: z.number().int().nonnegative().optional(),
  totalBytes: z.number().int().nonnegative().optional(),
});
