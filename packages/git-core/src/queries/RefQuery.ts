import type { GitRef, RepositoryRefsResult } from '@git-graph/shared';
import { GitCliClient } from '../client/GitCliClient';
import { GitCommandMaxBufferBytes, GitCommandTimeoutMs } from '../client/GitExecutionDefaults';
import type { GitClient } from '../client/GitClient';
import { RefParser } from '../parsers/RefParser';

export interface RefQueryOptions {
  /**
   * Whether to include symbolic refs (e.g. refs/remotes/origin/HEAD).
   * Default is false.
   */
  includeSymbolic?: boolean;

  /**
   * Specific ref patterns to query. Default is ['refs/'].
   */
  patterns?: string[];
}

export interface RefQueryDependencies {
  client?: GitClient;
}

export class RefQuery {
  private readonly _client: GitClient;

  public constructor(deps?: RefQueryDependencies) {
    this._client = deps?.client ?? new GitCliClient();
  }

  /**
   * Queries all references (branches, tags, HEAD) for a repository.
   */
  public async queryRefs(
    repoPath: string,
    options?: RefQueryOptions,
  ): Promise<RepositoryRefsResult> {
    const patterns =
      options?.patterns && options.patterns.length > 0 ? options.patterns : ['refs/'];
    const args = ['for-each-ref', `--format=${RefParser.REF_FORMAT}`, ...patterns];

    let stdout = '';
    try {
      const result = await this._client.exec(args, {
        cwd: repoPath,
        timeoutMs: GitCommandTimeoutMs.fast,
        maxBufferBytes: GitCommandMaxBufferBytes.small,
      });
      if (result.exitCode === 0) {
        stdout = result.stdout;
      }
    } catch {
      // Ignore errors (e.g., directory not found or non-git error handled below)
    }

    const parsedRefs = RefParser.parseRefs(stdout);

    // Group parsed refs
    const localBranches: GitRef[] = [];
    const remoteBranches: GitRef[] = [];
    const tags: GitRef[] = [];

    let currentBranchName: string | undefined;
    let currentBranchRef: GitRef | undefined;

    for (const ref of parsedRefs) {
      if (ref.kind === 'localBranch') {
        localBranches.push(ref);
        if (ref.isCurrent) {
          currentBranchName = ref.name;
          currentBranchRef = ref;
        }
      } else if (ref.kind === 'remoteBranch') {
        if (options?.includeSymbolic || !ref.isSymbolic) {
          remoteBranches.push(ref);
        }
      } else if (ref.kind === 'tag') {
        tags.push(ref);
      }
    }

    // Resolve HEAD state
    let headRef: GitRef | undefined;
    let isDetachedHead = false;

    if (currentBranchRef) {
      headRef = {
        name: 'HEAD',
        fullName: 'HEAD',
        target: currentBranchRef.target,
        kind: 'head',
        isCurrent: true,
      };
      isDetachedHead = false;
    } else {
      // Check if HEAD exists in detached state
      try {
        const headRevResult = await this._client.exec(['rev-parse', 'HEAD'], {
          cwd: repoPath,
          timeoutMs: GitCommandTimeoutMs.fast,
          maxBufferBytes: GitCommandMaxBufferBytes.small,
        });
        const sha = headRevResult.stdout.trim();
        if (/^[0-9a-fA-F]{40}$/.test(sha)) {
          headRef = {
            name: 'HEAD',
            fullName: 'HEAD',
            target: sha,
            kind: 'head',
            isCurrent: true,
          };
          isDetachedHead = true;
          currentBranchName = undefined;
        }
      } catch {
        // No commits in repository (unborn HEAD)
        headRef = undefined;
        isDetachedHead = false;
        currentBranchName = undefined;
      }
    }

    const allRefs: GitRef[] = [];
    if (headRef) {
      allRefs.push(headRef);
    }
    allRefs.push(...localBranches, ...remoteBranches, ...tags);

    return {
      head: headRef,
      isDetachedHead,
      currentBranch: currentBranchName,
      localBranches,
      remoteBranches,
      tags,
      allRefs,
    };
  }

  /**
   * Retrieves branches (local and optionally remote), filtering symbolic remote HEAD by default.
   */
  public async getBranches(
    repoPath: string,
    options?: { includeRemote?: boolean; includeSymbolic?: boolean },
  ): Promise<GitRef[]> {
    const refs = await this.queryRefs(repoPath, { includeSymbolic: options?.includeSymbolic });
    if (options?.includeRemote !== false) {
      return [...refs.localBranches, ...refs.remoteBranches];
    }
    return refs.localBranches;
  }

  /**
   * Retrieves local branches only.
   */
  public async getLocalBranches(repoPath: string): Promise<GitRef[]> {
    const refs = await this.queryRefs(repoPath);
    return refs.localBranches;
  }

  /**
   * Retrieves remote branches only, excluding symbolic HEAD by default.
   */
  public async getRemoteBranches(
    repoPath: string,
    options?: { includeSymbolic?: boolean },
  ): Promise<GitRef[]> {
    const refs = await this.queryRefs(repoPath, { includeSymbolic: options?.includeSymbolic });
    return refs.remoteBranches;
  }

  /**
   * Retrieves all tags.
   */
  public async getTags(repoPath: string): Promise<GitRef[]> {
    const refs = await this.queryRefs(repoPath);
    return refs.tags;
  }

  /**
   * Retrieves current HEAD ref, or null if repository has no commits.
   */
  public async getHead(repoPath: string): Promise<GitRef | null> {
    const refs = await this.queryRefs(repoPath);
    return refs.head ?? null;
  }
}
