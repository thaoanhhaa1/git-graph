import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { RepositoryDescriptor, SubmoduleDescriptor } from '@git-graph/shared';
import type { GitClient } from '../client/GitClient';
import { GitCliClient } from '../client/GitCliClient';

export interface RepositoryLocatorOptions {
  /**
   * Git client used to execute git commands. Defaults to a new GitCliClient instance.
   */
  gitClient?: GitClient;
}

/**
 * Service responsible for discovering, inspecting, and deduplicating Git repositories.
 */
export class RepositoryLocator {
  private readonly gitClient: GitClient;

  public constructor(options?: RepositoryLocatorOptions) {
    this.gitClient = options?.gitClient ?? new GitCliClient();
  }

  /**
   * Inspects a candidate directory path and returns a RepositoryDescriptor if it belongs to a valid Git repository.
   * Returns null if the path is invalid or is not inside a Git repository.
   *
   * @param candidatePath Absolute path to a directory.
   */
  public async locate(candidatePath: string): Promise<RepositoryDescriptor | null> {
    if (!candidatePath || typeof candidatePath !== 'string') {
      return null;
    }

    // Ensure candidate path exists
    try {
      if (!fs.existsSync(candidatePath)) {
        return null;
      }
      const stat = fs.statSync(candidatePath);
      if (!stat.isDirectory()) {
        return null;
      }
    } catch {
      return null;
    }

    const cwd = path.resolve(candidatePath);

    // 1. Check if bare repository
    let isBare = false;
    try {
      const bareResult = await this.gitClient.exec(['rev-parse', '--is-bare-repository'], { cwd });
      isBare = bareResult.stdout.trim() === 'true';
    } catch {
      // Not a git repository
      return null;
    }

    let rootPath: string;
    let gitDir: string;

    if (isBare) {
      try {
        rootPath = fs.realpathSync(cwd);
      } catch {
        rootPath = path.normalize(cwd);
      }

      try {
        const gitDirResult = await this.gitClient.exec(['rev-parse', '--git-dir'], { cwd });
        const rawGitDir = gitDirResult.stdout.trim();
        const resolvedGitDir = path.isAbsolute(rawGitDir)
          ? rawGitDir
          : path.resolve(cwd, rawGitDir);
        try {
          gitDir = fs.realpathSync(resolvedGitDir);
        } catch {
          gitDir = path.normalize(resolvedGitDir);
        }
      } catch {
        gitDir = rootPath;
      }
    } else {
      // 2. Standard working tree repository
      try {
        const toplevelResult = await this.gitClient.exec(['rev-parse', '--show-toplevel'], { cwd });
        const rawToplevel = toplevelResult.stdout.trim();
        try {
          rootPath = fs.realpathSync(rawToplevel);
        } catch {
          rootPath = path.normalize(rawToplevel);
        }
      } catch {
        return null;
      }

      try {
        const gitDirResult = await this.gitClient.exec(['rev-parse', '--git-dir'], {
          cwd: rootPath,
        });
        const rawGitDir = gitDirResult.stdout.trim();
        const resolvedGitDir = path.isAbsolute(rawGitDir)
          ? rawGitDir
          : path.resolve(rootPath, rawGitDir);
        try {
          gitDir = fs.realpathSync(resolvedGitDir);
        } catch {
          gitDir = path.normalize(resolvedGitDir);
        }
      } catch {
        gitDir = path.join(rootPath, '.git');
      }
    }

    // 3. Detect current branch & detached HEAD
    let currentBranch: string | undefined;
    let isDetachedHead = false;
    let headCommitSha: string | undefined;

    // Get HEAD commit sha if any commits exist
    try {
      const headShaResult = await this.gitClient.exec(['rev-parse', 'HEAD'], { cwd: rootPath });
      const sha = headShaResult.stdout.trim();
      if (/^[0-9a-fA-F]{40}$/.test(sha)) {
        headCommitSha = sha;
      }
    } catch {
      headCommitSha = undefined;
    }

    // Check symbolic-ref (returns branch name or fails if detached HEAD / unborn)
    try {
      const symRefResult = await this.gitClient.exec(['symbolic-ref', '--short', '-q', 'HEAD'], {
        cwd: rootPath,
      });
      const branchName = symRefResult.stdout.trim();
      if (branchName) {
        currentBranch = branchName;
        isDetachedHead = false;
      }
    } catch {
      // symbolic-ref failed
      if (headCommitSha) {
        // Commits exist but no symbolic ref -> detached HEAD
        isDetachedHead = true;
        currentBranch = undefined;
      } else {
        // Unborn branch (empty repo with no commits yet)
        try {
          const abbrevResult = await this.gitClient.exec(['rev-parse', '--abbrev-ref', 'HEAD'], {
            cwd: rootPath,
          });
          const abbrev = abbrevResult.stdout.trim();
          if (abbrev && abbrev !== 'HEAD') {
            currentBranch = abbrev;
            isDetachedHead = false;
          }
        } catch {
          // ignore
        }
      }
    }

    const name = path.basename(rootPath) || rootPath;
    const id = this.generateRepositoryId(rootPath);

    // 4. Submodules (extensible interface preparation)
    const submodules = await this.getSubmodules(rootPath);
    const remotes = await this.getRemotes(rootPath);

    return {
      id,
      rootPath,
      name,
      gitDir,
      isBare,
      currentBranch,
      isDetachedHead,
      headCommitSha,
      path: rootPath,
      submodules: submodules.length > 0 ? submodules : undefined,
      remotes: remotes.length > 0 ? remotes : undefined,
    };
  }

  /**
   * Inspects multiple candidate paths, resolves their repositories, and deduplicates
   * nested workspace directories pointing to the same repository.
   *
   * @param candidatePaths Array of directory paths to inspect.
   */
  public async locateAll(candidatePaths: readonly string[]): Promise<RepositoryDescriptor[]> {
    if (!candidatePaths || candidatePaths.length === 0) {
      return [];
    }

    const results = await Promise.all(
      candidatePaths.map(async (candidatePath) => {
        try {
          return await this.locate(candidatePath);
        } catch {
          return null;
        }
      }),
    );

    const uniqueMap = new Map<string, RepositoryDescriptor>();

    for (const descriptor of results) {
      if (!descriptor) {
        continue;
      }

      // Normalize root path for deduplication
      const normalizedRoot = this.canonicalizePath(descriptor.rootPath);
      if (!uniqueMap.has(normalizedRoot)) {
        uniqueMap.set(normalizedRoot, descriptor);
      }
    }

    return Array.from(uniqueMap.values());
  }

  /**
   * Inspects submodules configured in a repository.
   * Returns an array of SubmoduleDescriptor objects or an empty array if none found.
   */
  public async getSubmodules(repoRoot: string): Promise<SubmoduleDescriptor[]> {
    const gitmodulesPath = path.join(repoRoot, '.gitmodules');
    if (!fs.existsSync(gitmodulesPath)) {
      return [];
    }

    try {
      const result = await this.gitClient.exec(
        ['config', '--file', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$'],
        { cwd: repoRoot },
      );

      const lines = result.stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const submodules: SubmoduleDescriptor[] = [];

      for (const line of lines) {
        // Format: submodule.<name>.path <submodulePath>
        const match = line.match(/^submodule\.(.*?)\.path\s+(.*)$/);
        if (match) {
          const [, subName, subPath] = match;
          if (subName && subPath) {
            submodules.push({
              name: subName,
              path: subPath,
            });
          }
        }
      }

      return submodules;
    } catch {
      return [];
    }
  }

  /**
   * Lists configured remote names for a repository (e.g. ['origin', 'upstream']).
   * Returns an empty array when the repository has no remotes or the command fails.
   */
  public async getRemotes(repoRoot: string): Promise<string[]> {
    try {
      const result = await this.gitClient.exec(['remote'], { cwd: repoRoot });
      if (result.exitCode !== 0) {
        return [];
      }
      return result.stdout
        .split(/\r?\n/)
        .map((remote) => remote.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Generates a stable, collision-resistant repository ID from its root path.
   */
  private generateRepositoryId(rootPath: string): string {
    const canonical = this.canonicalizePath(rootPath);
    const hash = crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 10);
    const base = path.basename(canonical).replace(/[^a-zA-Z0-9_-]/g, '_') || 'repo';
    return `${base}-${hash}`;
  }

  /**
   * Canonicalizes a filesystem path for consistent comparison across platforms.
   */
  private canonicalizePath(filePath: string): string {
    let resolved = path.resolve(filePath);
    try {
      // Resolve real path if symlinks exist
      resolved = fs.realpathSync(resolved);
    } catch {
      // Use resolved path as-is if realpath fails
    }

    // On Windows, filesystem paths are case-insensitive
    if (process.platform === 'win32') {
      return resolved.toLowerCase();
    }
    return resolved;
  }
}
