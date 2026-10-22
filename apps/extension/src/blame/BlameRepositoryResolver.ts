import * as path from 'node:path';
import { GitRepository } from '@git-graph/git-core';

export interface BlameTarget {
  repository: GitRepository;
  relativePath: string;
}

const RESOLVER_CACHE_LIMIT = 100;

export class BlameRepositoryResolver {
  private readonly _cache = new Map<string, Promise<BlameTarget | undefined>>();

  public resolve(filePath: string): Promise<BlameTarget | undefined> {
    const directory = path.dirname(filePath);
    const cached = this._cache.get(directory);
    if (cached) {
      this._cache.delete(directory);
      this._cache.set(directory, cached);
      return cached;
    }

    const pending = this.resolveUncached(directory, filePath);
    this._cache.set(directory, pending);
    if (this._cache.size > RESOLVER_CACHE_LIMIT) {
      const oldestKey = this._cache.keys().next().value;
      if (oldestKey !== undefined) {
        this._cache.delete(oldestKey);
      }
    }
    return pending;
  }

  public dispose(): void {
    this._cache.clear();
  }

  private async resolveUncached(
    directory: string,
    filePath: string,
  ): Promise<BlameTarget | undefined> {
    try {
      const repository = await GitRepository.open(directory);
      if (!repository) {
        return undefined;
      }

      const relativePath = path.relative(repository.rootPath, filePath).replace(/\\/g, '/');
      if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return undefined;
      }

      return { repository, relativePath };
    } catch {
      return undefined;
    }
  }
}
