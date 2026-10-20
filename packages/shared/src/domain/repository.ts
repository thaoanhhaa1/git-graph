import { z } from 'zod';

export type RepositoryId = string;

export const RepositoryIdSchema = z.string().min(1);

export interface SubmoduleDescriptor {
  name: string;
  path: string;
  url?: string;
}

export const SubmoduleDescriptorSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  url: z.string().optional(),
});

export interface RepositoryDescriptor {
  id: RepositoryId;
  rootPath: string;
  name: string;
  gitDir: string;
  isBare: boolean;
  currentBranch?: string;
  path?: string;
  isDetachedHead?: boolean;
  headCommitSha?: string;
  parentRepositoryId?: string;
  submodules?: SubmoduleDescriptor[];
  remotes?: string[];
}

export const RepositoryDescriptorSchema = z.object({
  id: RepositoryIdSchema,
  rootPath: z.string(),
  name: z.string().min(1),
  gitDir: z.string(),
  isBare: z.boolean(),
  currentBranch: z.string().optional(),
  path: z.string().optional(),
  isDetachedHead: z.boolean().optional(),
  headCommitSha: z.string().optional(),
  parentRepositoryId: z.string().optional(),
  submodules: z.array(SubmoduleDescriptorSchema).optional(),
  remotes: z.array(z.string().min(1)).optional(),
});

/**
 * Placeholder item structure used during initial UI setup / backwards compatibility.
 */
export interface RepositoryPlaceholderItem {
  id: string;
  name: string;
  path: string;
  currentBranch?: string;
}

export const RepositoryPlaceholderItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string(),
  currentBranch: z.string().optional(),
});

export type RepositoryItem = RepositoryDescriptor | RepositoryPlaceholderItem;
