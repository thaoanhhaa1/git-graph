export const DEFAULT_PAGE_SIZE = 500;
export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 2000;
export const DEFAULT_CHUNK_SIZE = 100;
export const MAX_PAYLOAD_SIZE_BYTES = 256 * 1024;

export function clampPageSize(
  size?: number | null,
  min = MIN_PAGE_SIZE,
  max = MAX_PAGE_SIZE,
  defaultVal = DEFAULT_PAGE_SIZE,
): number {
  if (size === undefined || size === null || Number.isNaN(size)) {
    return defaultVal;
  }
  return Math.max(min, Math.min(max, Math.floor(size)));
}

import { z } from 'zod';
import { type FileChange, FileChangeSchema, type CommitStats, CommitStatsSchema } from './diff';

export type CommitOrdering = 'date-order' | 'topo-order' | 'author-date-order';
export const CommitOrderingSchema = z.enum(['date-order', 'topo-order', 'author-date-order']);

export type CommitSha = string;

export const CommitShaSchema = z.string().min(1);

export interface GitIdentity {
  name: string;
  email: string;
  timestamp: number;
  timezone: string;
}

export const GitIdentitySchema = z.object({
  name: z.string(),
  email: z.string(),
  timestamp: z.number(),
  timezone: z.string(),
});

export type GitRefKind = 'head' | 'localBranch' | 'remoteBranch' | 'tag';

export const GitRefKindSchema = z.enum(['head', 'localBranch', 'remoteBranch', 'tag']);

export type TagType = 'lightweight' | 'annotated';

export const TagTypeSchema = z.enum(['lightweight', 'annotated']);

export interface GitRef {
  name: string;
  fullName: string;
  target: CommitSha;
  kind: GitRefKind;
  isCurrent?: boolean;
  upstream?: string;
  tagType?: TagType;
  tagObjectSha?: CommitSha;
  isSymbolic?: boolean;
  symrefTarget?: string;
}

export const GitRefSchema = z.object({
  name: z.string().min(1),
  fullName: z.string().min(1),
  target: CommitShaSchema,
  kind: GitRefKindSchema,
  isCurrent: z.boolean().optional(),
  upstream: z.string().optional(),
  tagType: TagTypeSchema.optional(),
  tagObjectSha: CommitShaSchema.optional(),
  isSymbolic: z.boolean().optional(),
  symrefTarget: z.string().optional(),
});

export interface Commit {
  sha: CommitSha;
  shortSha: string;
  parents: CommitSha[];
  author: GitIdentity;
  committer: GitIdentity;
  subject: string;
  body?: string;
  refs: GitRef[];
  fileChanges?: FileChange[];
  stats?: CommitStats;
  commitCount?: number;
}

export const CommitSchema = z.object({
  sha: CommitShaSchema,
  shortSha: z.string().min(1),
  parents: z.array(CommitShaSchema),
  author: GitIdentitySchema,
  committer: GitIdentitySchema,
  subject: z.string(),
  body: z.string().optional(),
  refs: z.array(GitRefSchema),
  fileChanges: z.array(FileChangeSchema).optional(),
  stats: CommitStatsSchema.optional(),
  commitCount: z.number().int().nonnegative().optional(),
});

export interface CommitPage {
  commits: Commit[];
  cursor?: string;
  hasMore: boolean;
}

export const CommitPageSchema = z.object({
  commits: z.array(CommitSchema),
  cursor: z.string().optional(),
  hasMore: z.boolean(),
});

export interface RepositoryRefsResult {
  head?: GitRef;
  isDetachedHead: boolean;
  currentBranch?: string;
  localBranches: GitRef[];
  remoteBranches: GitRef[];
  tags: GitRef[];
  allRefs: GitRef[];
}

export const RepositoryRefsResultSchema = z.object({
  head: GitRefSchema.optional(),
  isDetachedHead: z.boolean(),
  currentBranch: z.string().optional(),
  localBranches: z.array(GitRefSchema),
  remoteBranches: z.array(GitRefSchema),
  tags: z.array(GitRefSchema),
  allRefs: z.array(GitRefSchema),
});
