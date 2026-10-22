import type { LineHistoryEntry, LineHistoryResult } from '@git-graph/shared';
import { GitCliClient } from '../client/GitCliClient';
import { GitCommandMaxBufferBytes, GitCommandTimeoutMs } from '../client/GitExecutionDefaults';
import type { GitClient } from '../client/GitClient';

export interface LineHistoryQueryDependencies {
  client?: GitClient;
}

export interface LineHistoryQueryOptions {
  signal?: AbortSignal;
}

const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';
const MAX_DIFF_SNIPPET_CHARS = 8_000;

const LINE_HISTORY_FORMAT = ['%H', '%h', '%an', '%ae', '%at', '%s'].join(FIELD_SEPARATOR);

export class LineHistoryQuery {
  private readonly _client: GitClient;

  public constructor(deps?: LineHistoryQueryDependencies) {
    this._client = deps?.client ?? new GitCliClient();
  }

  public async query(
    repoPath: string,
    filePath: string,
    startLine: number,
    endLine: number,
    options?: LineHistoryQueryOptions,
  ): Promise<LineHistoryResult> {
    const cleanPath = filePath.trim();
    if (!cleanPath) {
      throw new Error('A file path is required to query line history.');
    }

    const start = Math.max(1, Math.trunc(startLine));
    const end = Math.max(start, Math.trunc(endLine));

    const result = await this._client.exec(
      [
        'log',
        `-L${start},${end}:${cleanPath}`,
        '--no-color',
        `--format=${RECORD_SEPARATOR}${LINE_HISTORY_FORMAT}`,
        '--',
      ],
      {
        cwd: repoPath,
        signal: options?.signal,
        timeoutMs: GitCommandTimeoutMs.long,
        maxBufferBytes: GitCommandMaxBufferBytes.large,
      },
    );

    if (result.exitCode !== 0) {
      throw new Error(
        `Git line history failed with exit code ${result.exitCode}: ${result.stderr}`,
      );
    }

    return {
      filePath: cleanPath,
      startLine: start,
      endLine: end,
      entries: LineHistoryQuery.parse(result.stdout, cleanPath),
    };
  }

  public static parse(stdout: string, fallbackFilePath = ''): LineHistoryEntry[] {
    const entries: LineHistoryEntry[] = [];

    for (const chunk of stdout.split(RECORD_SEPARATOR)) {
      if (!chunk.trim()) {
        continue;
      }

      const newlineIndex = chunk.indexOf('\n');
      const headerLine = (newlineIndex >= 0 ? chunk.slice(0, newlineIndex) : chunk).trimEnd();
      const fields = headerLine.split(FIELD_SEPARATOR);
      const sha = fields[0] ?? '';
      if (!sha) {
        continue;
      }

      const diff = newlineIndex >= 0 ? chunk.slice(newlineIndex + 1).trim() : '';

      entries.push({
        sha,
        shortSha: fields[1] || sha.slice(0, 7),
        author: fields[2] ?? '',
        authorEmail: fields[3] ?? '',
        timestamp: LineHistoryQuery.parseTimestamp(fields[4]),
        subject: fields.slice(5).join(FIELD_SEPARATOR),
        filePath: LineHistoryQuery.extractFilePath(diff) ?? fallbackFilePath,
        diff: diff.slice(0, MAX_DIFF_SNIPPET_CHARS),
      });
    }

    return entries;
  }

  private static parseTimestamp(value?: string): number {
    const parsed = Number.parseInt(value ?? '0', 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private static extractFilePath(diff: string): string | undefined {
    const match = /^diff --git a\/(.+) b\/(.+)$/m.exec(diff);
    if (match?.[2]) {
      return LineHistoryQuery.unquotePath(match[2]);
    }

    const quotedMatch = /^diff --git "a\/(.+)" "b\/(.+)"$/m.exec(diff);
    if (quotedMatch?.[2]) {
      return LineHistoryQuery.unquotePath(`"${quotedMatch[2]}"`);
    }

    const plusMatch = /^\+\+\+ b\/(.+)$/m.exec(diff);
    if (plusMatch?.[1] && plusMatch[1] !== '/dev/null') {
      return LineHistoryQuery.unquotePath(plusMatch[1]);
    }

    const quotedPlusMatch = /^\+\+\+ "b\/(.+)"$/m.exec(diff);
    if (quotedPlusMatch?.[1]) {
      return LineHistoryQuery.unquotePath(`"${quotedPlusMatch[1]}"`);
    }

    return undefined;
  }

  private static unquotePath(value: string): string {
    if (value.startsWith('"') && value.endsWith('"')) {
      return value.slice(1, -1).replace(/\\(.)/g, '$1');
    }
    return value;
  }
}
