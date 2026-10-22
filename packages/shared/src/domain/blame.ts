import { z } from 'zod';

export interface BlameLineInfo {
  sha: string;
  shortSha: string;
  author: string;
  authorEmail: string;
  timestamp: number;
  subject: string;
  lineNumber: number;
  originalLineNumber: number;
  content: string;
}

export const BlameLineInfoSchema = z.object({
  sha: z.string().min(1),
  shortSha: z.string().min(1),
  author: z.string(),
  authorEmail: z.string(),
  timestamp: z.number(),
  subject: z.string(),
  lineNumber: z.number().int().positive(),
  originalLineNumber: z.number().int().positive(),
  content: z.string(),
});

export interface BlameResult {
  filePath: string;
  revision: string;
  lines: BlameLineInfo[];
}

export const BlameResultSchema = z.object({
  filePath: z.string().min(1),
  revision: z.string(),
  lines: z.array(BlameLineInfoSchema),
});

export interface LineHistoryEntry {
  sha: string;
  shortSha: string;
  author: string;
  authorEmail: string;
  timestamp: number;
  subject: string;
  filePath: string;
  diff: string;
}

export const LineHistoryEntrySchema = z.object({
  sha: z.string().min(1),
  shortSha: z.string().min(1),
  author: z.string(),
  authorEmail: z.string(),
  timestamp: z.number(),
  subject: z.string(),
  filePath: z.string(),
  diff: z.string(),
});

export interface LineHistoryResult {
  filePath: string;
  startLine: number;
  endLine: number;
  entries: LineHistoryEntry[];
}

export const LineHistoryResultSchema = z.object({
  filePath: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  entries: z.array(LineHistoryEntrySchema),
});
