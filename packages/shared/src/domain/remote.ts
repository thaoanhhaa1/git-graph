import { z } from 'zod';

export interface RemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export const RemoteInfoSchema = z.object({
  name: z.string().min(1),
  fetchUrl: z.string(),
  pushUrl: z.string(),
});

export interface ReflogEntry {
  sha: string;
  shortSha: string;
  index: number;
  selector: string;
  subject: string;
}

export const ReflogEntrySchema = z.object({
  sha: z.string().min(1),
  shortSha: z.string().min(1),
  index: z.number().int().nonnegative(),
  selector: z.string().min(1),
  subject: z.string(),
});

export interface RepositorySyncStatus {
  repositoryId: string;
  currentBranch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
}

export const RepositorySyncStatusSchema = z.object({
  repositoryId: z.string().min(1),
  currentBranch: z.string().optional(),
  upstream: z.string().optional(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
});

export interface OperationUndoInfo {
  available: boolean;
  reason?: string;
  label?: string;
  reflogIndex?: number;
  expectedSha?: string;
}

export const OperationUndoInfoSchema = z.object({
  available: z.boolean(),
  reason: z.string().optional(),
  label: z.string().optional(),
  reflogIndex: z.number().int().nonnegative().optional(),
  expectedSha: z.string().optional(),
});
