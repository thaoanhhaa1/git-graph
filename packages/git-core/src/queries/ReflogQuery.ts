import type { ReflogEntry } from '@git-graph/shared';
import { GitCliClient } from '../client/GitCliClient';
import { GitCommandMaxBufferBytes, GitCommandTimeoutMs } from '../client/GitExecutionDefaults';
import type { GitClient } from '../client/GitClient';

export interface ReflogQueryDependencies {
  client?: GitClient;
}

export class ReflogQuery {
  private readonly _client: GitClient;

  public constructor(deps?: ReflogQueryDependencies) {
    this._client = deps?.client ?? new GitCliClient();
  }

  public async list(repoPath: string, limit = 20, signal?: AbortSignal): Promise<ReflogEntry[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    let stdout = '';

    try {
      const result = await this._client.exec(
        ['reflog', 'show', '--format=%H%x00%h%x00%gd%x00%gs', '-n', String(safeLimit), 'HEAD'],
        {
          cwd: repoPath,
          signal,
          timeoutMs: GitCommandTimeoutMs.fast,
          maxBufferBytes: GitCommandMaxBufferBytes.small,
        },
      );
      if (result.exitCode !== 0) {
        return [];
      }
      stdout = result.stdout;
    } catch {
      return [];
    }

    return ReflogQuery.parse(stdout);
  }

  public static parse(stdout: string): ReflogEntry[] {
    const entries: ReflogEntry[] = [];

    for (const line of stdout.split('\n')) {
      if (!line.trim()) {
        continue;
      }
      const [sha, shortSha, selector, ...subjectParts] = line.split('\0');
      if (!sha || !shortSha || !selector) {
        continue;
      }
      const indexMatch = /@\{(\d+)\}/.exec(selector);
      if (!indexMatch?.[1]) {
        continue;
      }
      entries.push({
        sha,
        shortSha,
        index: Number.parseInt(indexMatch[1], 10),
        selector,
        subject: subjectParts.join('\0'),
      });
    }

    return entries;
  }
}
