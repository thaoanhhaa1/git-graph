import type { RemoteInfo } from '@git-graph/shared';
import { GitCliClient } from '../client/GitCliClient';
import { GitCommandMaxBufferBytes, GitCommandTimeoutMs } from '../client/GitExecutionDefaults';
import type { GitClient } from '../client/GitClient';

export interface RemoteQueryDependencies {
  client?: GitClient;
}

export class RemoteQuery {
  private readonly _client: GitClient;

  public constructor(deps?: RemoteQueryDependencies) {
    this._client = deps?.client ?? new GitCliClient();
  }

  public async list(repoPath: string, signal?: AbortSignal): Promise<RemoteInfo[]> {
    const result = await this._client.exec(['remote', '-v'], {
      cwd: repoPath,
      signal,
      timeoutMs: GitCommandTimeoutMs.fast,
      maxBufferBytes: GitCommandMaxBufferBytes.small,
    });

    if (result.exitCode !== 0) {
      return [];
    }

    return RemoteQuery.parse(result.stdout);
  }

  public static parse(stdout: string): RemoteInfo[] {
    const remotes = new Map<string, RemoteInfo>();

    for (const line of stdout.split('\n')) {
      const match = /^(.+?)\t(.+) \((fetch|push)\)$/.exec(line.trim());
      if (!match?.[1] || !match[2] || !match[3]) {
        continue;
      }

      const name = match[1];
      const url = match[2];
      const existing = remotes.get(name) ?? { name, fetchUrl: '', pushUrl: '' };
      if (match[3] === 'fetch') {
        existing.fetchUrl = url;
      } else {
        existing.pushUrl = url;
      }
      remotes.set(name, existing);
    }

    return Array.from(remotes.values()).map((remote) => ({
      name: remote.name,
      fetchUrl: remote.fetchUrl || remote.pushUrl,
      pushUrl: remote.pushUrl || remote.fetchUrl,
    }));
  }
}
