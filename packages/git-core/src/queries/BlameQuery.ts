import type { BlameLineInfo, BlameResult } from '@git-graph/shared';
import { GitCliClient } from '../client/GitCliClient';
import { GitCommandMaxBufferBytes, GitCommandTimeoutMs } from '../client/GitExecutionDefaults';
import type { GitClient } from '../client/GitClient';

export interface BlameQueryDependencies {
  client?: GitClient;
}

export interface BlameQueryOptions {
  revision?: string;
  repositoryId?: string;
  signal?: AbortSignal;
  noCache?: boolean;
}

interface BlameMetadata {
  author: string;
  authorEmail: string;
  timestamp: number;
  subject: string;
}

const BLAME_CACHE_LIMIT = 50;

export class BlameQuery {
  private readonly _client: GitClient;
  private readonly _cache = new Map<string, BlameResult>();

  public constructor(deps?: BlameQueryDependencies) {
    this._client = deps?.client ?? new GitCliClient();
  }

  public async query(
    repoPath: string,
    filePath: string,
    options?: BlameQueryOptions,
  ): Promise<BlameResult> {
    const revision = options?.revision?.trim() ?? '';
    if (revision.startsWith('-')) {
      throw new Error(`Invalid blame revision: ${revision}`);
    }

    const cleanPath = filePath.trim();
    if (!cleanPath) {
      throw new Error('A file path is required to query blame information.');
    }

    const cacheKey = this.buildCacheKey(repoPath, cleanPath, revision, options?.repositoryId);
    const cached = options?.noCache ? undefined : this._cache.get(cacheKey);
    if (cached) {
      this._cache.delete(cacheKey);
      this._cache.set(cacheKey, cached);
      return cached;
    }

    const args = ['blame', '--porcelain'];
    if (revision) {
      args.push(revision);
    }
    args.push('--', cleanPath);

    const result = await this._client.exec(args, {
      cwd: repoPath,
      signal: options?.signal,
      timeoutMs: GitCommandTimeoutMs.normal,
      maxBufferBytes: GitCommandMaxBufferBytes.large,
    });
    if (result.exitCode !== 0) {
      throw new Error(`Git blame failed with exit code ${result.exitCode}: ${result.stderr}`);
    }

    const blameResult: BlameResult = {
      filePath: cleanPath,
      revision: revision || 'HEAD',
      lines: BlameQuery.parse(result.stdout),
    };

    this.cache(cacheKey, blameResult);
    return blameResult;
  }

  public clearCache(): void {
    this._cache.clear();
  }

  public static parse(stdout: string): BlameLineInfo[] {
    const lines: BlameLineInfo[] = [];
    const metadataBySha = new Map<string, BlameMetadata>();

    const rawLines = stdout.split('\n');
    let current:
      | {
          sha: string;
          originalLineNumber: number;
          lineNumber: number;
        }
      | undefined;
    let metadata: BlameMetadata | undefined;

    for (const rawLine of rawLines) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

      if (line.startsWith('\t')) {
        if (!current) {
          continue;
        }

        const resolvedMetadata = metadata ?? metadataBySha.get(current.sha);
        if (resolvedMetadata) {
          metadataBySha.set(current.sha, resolvedMetadata);
        }

        lines.push({
          sha: current.sha,
          shortSha: current.sha.slice(0, 7),
          author: resolvedMetadata?.author ?? '',
          authorEmail: resolvedMetadata?.authorEmail ?? '',
          timestamp: resolvedMetadata?.timestamp ?? 0,
          subject: resolvedMetadata?.subject ?? '',
          lineNumber: current.lineNumber,
          originalLineNumber: current.originalLineNumber,
          content: line.slice(1),
        });
        continue;
      }

      const header = /^\^?([0-9a-f]{40,64})\s+(\d+)\s+(\d+)(?:\s+\d+)?$/i.exec(line);
      if (header) {
        const sha = header[1] ?? '';
        if (!sha) {
          continue;
        }
        current = {
          sha,
          originalLineNumber: Number.parseInt(header[2] ?? '0', 10),
          lineNumber: Number.parseInt(header[3] ?? '0', 10),
        };
        metadata = metadataBySha.get(sha);
        continue;
      }

      if (!current) {
        continue;
      }

      if (line.startsWith('author ')) {
        metadata = {
          ...(metadata ?? { author: '', authorEmail: '', timestamp: 0, subject: '' }),
          author: line.slice('author '.length),
        };
      } else if (line.startsWith('author-mail ')) {
        const email = line.slice('author-mail '.length).trim();
        metadata = {
          ...(metadata ?? { author: '', authorEmail: '', timestamp: 0, subject: '' }),
          authorEmail: email.replace(/^<|>$/g, ''),
        };
      } else if (line.startsWith('author-time ')) {
        const parsed = Number.parseInt(line.slice('author-time '.length), 10);
        metadata = {
          ...(metadata ?? { author: '', authorEmail: '', timestamp: 0, subject: '' }),
          timestamp: Number.isNaN(parsed) ? 0 : parsed,
        };
      } else if (line.startsWith('summary ')) {
        metadata = {
          ...(metadata ?? { author: '', authorEmail: '', timestamp: 0, subject: '' }),
          subject: line.slice('summary '.length),
        };
      }
    }

    return lines;
  }

  private buildCacheKey(
    repoPath: string,
    filePath: string,
    revision: string,
    repositoryId?: string,
  ): string {
    return `${repositoryId ?? repoPath}|${revision || 'HEAD'}|${filePath}`;
  }

  private cache(key: string, result: BlameResult): void {
    this._cache.delete(key);
    this._cache.set(key, result);
    if (this._cache.size > BLAME_CACHE_LIMIT) {
      const oldestKey = this._cache.keys().next().value;
      if (oldestKey !== undefined) {
        this._cache.delete(oldestKey);
      }
    }
  }
}
