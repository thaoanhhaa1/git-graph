import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SubmoduleInfo } from '@git-graph/shared';
import { GitCliClient } from '../client/GitCliClient';
import type { GitClient } from '../client/GitClient';

export interface SubmoduleQueryDependencies {
  client?: GitClient;
}

interface ConfiguredSubmodule {
  name: string;
  path: string;
  url?: string;
}

/**
 * Inspects configured submodules and their current worktree state.
 */
export class SubmoduleQuery {
  private readonly _client: GitClient;

  public constructor(deps?: SubmoduleQueryDependencies) {
    this._client = deps?.client ?? new GitCliClient();
  }

  public async list(repoPath: string): Promise<SubmoduleInfo[]> {
    const configured = await this._readConfiguredSubmodules(repoPath);
    return Promise.all(
      configured.map(async (submodule) => {
        const absolutePath = path.join(repoPath, submodule.path);
        const [recordedSha, headSha] = await Promise.all([
          this._readRecordedSha(repoPath, submodule.path),
          this._readSubmoduleHead(absolutePath),
        ]);

        if (!headSha) {
          return {
            ...submodule,
            ...(recordedSha ? { recordedSha } : {}),
            state: 'uninitialized',
          } satisfies SubmoduleInfo;
        }

        const dirty = await this._isDirty(absolutePath);
        const counts =
          recordedSha && recordedSha !== headSha
            ? await this._readAheadBehind(absolutePath, recordedSha, headSha)
            : undefined;

        return {
          ...submodule,
          ...(recordedSha ? { recordedSha } : {}),
          headSha,
          state: dirty ? 'dirty' : 'clean',
          ...(counts ?? {}),
        } satisfies SubmoduleInfo;
      }),
    );
  }

  private async _readConfiguredSubmodules(repoPath: string): Promise<ConfiguredSubmodule[]> {
    const gitmodulesPath = path.join(repoPath, '.gitmodules');
    if (!fs.existsSync(gitmodulesPath)) {
      return [];
    }

    try {
      const result = await this._client.exec(
        ['config', '--file', '.gitmodules', '--get-regexp', '^submodule\\..*\\.(path|url)$'],
        { cwd: repoPath },
      );
      if (result.exitCode !== 0) {
        return [];
      }

      const entries = new Map<string, ConfiguredSubmodule>();
      for (const line of result.stdout.split(/\r?\n/)) {
        const match = /^submodule\.(.+)\.(path|url)\s+(.+)$/.exec(line.trim());
        if (!match) {
          continue;
        }
        const [, name, key, value] = match;
        if (!name || !value) {
          continue;
        }
        const existing = entries.get(name) ?? { name, path: '' };
        if (key === 'path') {
          existing.path = value;
        } else {
          existing.url = value;
        }
        entries.set(name, existing);
      }

      return Array.from(entries.values()).filter((entry) => entry.path.length > 0);
    } catch {
      return [];
    }
  }

  private async _readRecordedSha(
    repoPath: string,
    submodulePath: string,
  ): Promise<string | undefined> {
    try {
      const result = await this._client.exec(['ls-tree', 'HEAD', '--', submodulePath], {
        cwd: repoPath,
      });
      if (result.exitCode !== 0) {
        return undefined;
      }
      const match = /^\d+\s+\w+\s+([0-9a-fA-F]{7,64})\t/.exec(result.stdout.trim());
      return match?.[1];
    } catch {
      return undefined;
    }
  }

  private async _readSubmoduleHead(absolutePath: string): Promise<string | undefined> {
    if (!fs.existsSync(absolutePath)) {
      return undefined;
    }
    try {
      const result = await this._client.exec(['rev-parse', '--verify', 'HEAD'], {
        cwd: absolutePath,
      });
      if (result.exitCode !== 0) {
        return undefined;
      }
      const sha = result.stdout.trim();
      return sha || undefined;
    } catch {
      return undefined;
    }
  }

  private async _isDirty(absolutePath: string): Promise<boolean> {
    try {
      const result = await this._client.exec(
        ['status', '--porcelain=v1', '-z', '-uall', '--ignore-submodules=none'],
        { cwd: absolutePath },
      );
      return result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async _readAheadBehind(
    absolutePath: string,
    recordedSha: string,
    headSha: string,
  ): Promise<{ ahead?: number; behind?: number }> {
    try {
      const result = await this._client.exec(
        ['rev-list', '--left-right', '--count', `${recordedSha}...${headSha}`],
        { cwd: absolutePath },
      );
      if (result.exitCode !== 0) {
        return {};
      }
      const [behindRaw, aheadRaw] = result.stdout.trim().split(/\s+/);
      const behind = behindRaw ? Number.parseInt(behindRaw, 10) : undefined;
      const ahead = aheadRaw ? Number.parseInt(aheadRaw, 10) : undefined;
      return {
        ...(ahead !== undefined && !Number.isNaN(ahead) ? { ahead } : {}),
        ...(behind !== undefined && !Number.isNaN(behind) ? { behind } : {}),
      };
    } catch {
      return {};
    }
  }
}
