import { describe, expect, it } from 'vitest';
import {
  BlameLineInfoSchema,
  BlameResultSchema,
  LineHistoryEntrySchema,
  LineHistoryResultSchema,
} from '../src/index';

const line = {
  sha: 'abcdef1234567890abcdef1234567890abcdef12',
  shortSha: 'abcdef1',
  author: 'Alice',
  authorEmail: 'alice@example.com',
  timestamp: 1_700_000_000,
  subject: 'feat: add blame',
  lineNumber: 1,
  originalLineNumber: 1,
  content: 'const value = 1;',
};

describe('Blame domain schemas', () => {
  it('validates blame lines and results', () => {
    expect(BlameLineInfoSchema.safeParse(line).success).toBe(true);
    expect(
      BlameResultSchema.safeParse({
        filePath: 'src/a.ts',
        revision: 'HEAD',
        lines: [line],
      }).success,
    ).toBe(true);
  });

  it('rejects invalid line numbers and missing fields', () => {
    expect(BlameLineInfoSchema.safeParse({ ...line, lineNumber: 0 }).success).toBe(false);
    expect(BlameLineInfoSchema.safeParse({ ...line, sha: '' }).success).toBe(false);
    expect(BlameResultSchema.safeParse({ filePath: '', revision: 'HEAD', lines: [] }).success).toBe(
      false,
    );
  });

  it('validates line history entries and results', () => {
    const entry = {
      sha: line.sha,
      shortSha: line.shortSha,
      author: line.author,
      authorEmail: line.authorEmail,
      timestamp: line.timestamp,
      subject: line.subject,
      filePath: 'src/a.ts',
      diff: '@@ -1 +1 @@\n-old\n+new',
    };

    expect(LineHistoryEntrySchema.safeParse(entry).success).toBe(true);
    expect(
      LineHistoryResultSchema.safeParse({
        filePath: 'src/a.ts',
        startLine: 1,
        endLine: 1,
        entries: [entry],
      }).success,
    ).toBe(true);
  });
});
