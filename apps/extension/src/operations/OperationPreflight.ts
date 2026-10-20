import { AppError, AppErrorCode } from '@git-graph/shared';
import type { GitRepository } from '@git-graph/git-core';

/**
 * Status of the Git working tree.
 */
export interface WorkingTreeStatus {
  isClean: boolean;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
  hasUntrackedFiles: boolean;
  dirtyFileCount: number;
  modifiedFiles: string[];
}

/**
 * Current repository HEAD status.
 */
export interface HeadState {
  isDetached: boolean;
  currentBranch?: string;
  currentCommitSha?: string;
}

/**
 * Result of validating a Git reference or branch name.
 */
export interface RefValidationResult {
  valid: boolean;
  error?: string;
  normalizedRef?: string;
}

/**
 * Constraints and validation options for preflight check.
 */
export interface PreflightRequirements {
  /**
   * If true, preflight fails if working tree has any uncommitted/staged/untracked changes.
   */
  requireCleanWorktree?: boolean;

  /**
   * If true, preflight fails if repository is bare (default: true).
   */
  disallowBare?: boolean;

  /**
   * If false, preflight fails if HEAD is detached (default: true).
   */
  allowDetachedHead?: boolean;

  /**
   * Branch name to validate for proper Git branch naming rules.
   */
  validateBranchName?: string;

  /**
   * General ref name to validate for proper Git ref naming rules.
   */
  validateRefName?: string;

  /**
   * Tag name to validate for proper refs/tags naming rules.
   */
  validateTagName?: string;

  /**
   * If provided, preflight fails if this branch already exists in refs/heads.
   */
  checkBranchMustNotExist?: string;

  /**
   * If provided, preflight fails if this branch does not exist in refs/heads.
   */
  checkBranchMustExist?: string;

  /**
   * If provided, preflight fails if this tag already exists in refs/tags.
   */
  checkTagMustNotExist?: string;
}

/**
 * Result returned by preflight execution.
 */
export interface PreflightResult {
  passed: boolean;
  repositoryExists: boolean;
  isBare: boolean;
  workingTree: WorkingTreeStatus;
  head: HeadState;
  refValidation?: RefValidationResult;
  error?: AppError;
}

/**
 * Performs preflight safety checks prior to executing mutating Git operations.
 */
export class OperationPreflight {
  /**
   * Evaluates the current state of working tree (staged, unstaged, untracked changes).
   */
  public async checkWorkingTree(repository: GitRepository): Promise<WorkingTreeStatus> {
    try {
      const res = await repository.exec(['status', '--porcelain=v1', '-uall']);
      if (res.exitCode !== 0) {
        throw new Error(res.stderr || 'git status failed');
      }

      const lines = res.stdout
        .split('\n')
        .map((l: string) => l.trimEnd())
        .filter((l: string) => l.length > 0);

      if (lines.length === 0) {
        return {
          isClean: true,
          hasStagedChanges: false,
          hasUnstagedChanges: false,
          hasUntrackedFiles: false,
          dirtyFileCount: 0,
          modifiedFiles: [],
        };
      }

      let hasStaged = false;
      let hasUnstaged = false;
      let hasUntracked = false;
      const modifiedFiles: string[] = [];

      for (const line of lines) {
        const x = line[0] ?? ' ';
        const y = line[1] ?? ' ';
        const file = line.slice(3).trim();

        if (file) {
          modifiedFiles.push(file);
        }

        if (x === '?' && y === '?') {
          hasUntracked = true;
        } else {
          if (x !== ' ' && x !== '?') {
            hasStaged = true;
          }
          if (y !== ' ' && y !== '?') {
            hasUnstaged = true;
          }
        }
      }

      return {
        isClean: false,
        hasStagedChanges: hasStaged,
        hasUnstagedChanges: hasUnstaged,
        hasUntrackedFiles: hasUntracked,
        dirtyFileCount: modifiedFiles.length,
        modifiedFiles,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'git status failed';
      throw new AppError(
        AppErrorCode.GIT_COMMAND_FAILED,
        `Unable to determine the working tree state safely: ${message}`,
      );
    }
  }

  /**
   * Inspects current HEAD state (detached vs branch name, commit sha).
   */
  public async checkHead(repository: GitRepository): Promise<HeadState> {
    let isDetached = false;
    let currentBranch: string | undefined;
    let currentCommitSha: string | undefined;

    // 1. Check symbolic ref
    try {
      const symRes = await repository.exec(['symbolic-ref', '-q', '--short', 'HEAD']);
      if (symRes.exitCode === 0 && symRes.stdout.trim().length > 0) {
        currentBranch = symRes.stdout.trim();
        isDetached = false;
      } else {
        isDetached = true;
      }
    } catch {
      isDetached = true;
    }

    // 2. Check current commit SHA
    try {
      const shaRes = await repository.exec(['rev-parse', 'HEAD']);
      if (shaRes.exitCode === 0 && shaRes.stdout.trim().length > 0) {
        currentCommitSha = shaRes.stdout.trim();
      }
    } catch {
      // Repository might have no commits yet
    }

    return {
      isDetached,
      currentBranch,
      currentCommitSha,
    };
  }

  /**
   * Validates a Git ref or branch name string, defending against option injection.
   */
  public async validateRefName(
    repository: GitRepository,
    refName: string,
    isBranch = false,
  ): Promise<RefValidationResult> {
    const trimmed = refName ? refName.trim() : '';

    if (!trimmed) {
      return {
        valid: false,
        error: `${isBranch ? 'Branch' : 'Reference'} name cannot be empty.`,
      };
    }

    // Protect against command option injection (e.g. -f, --delete)
    if (trimmed.startsWith('-')) {
      return {
        valid: false,
        error: `${isBranch ? 'Branch' : 'Reference'} name cannot start with a dash ('-').`,
      };
    }

    // Protect against control characters, newlines, tabs, and spaces
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f\s]/.test(trimmed)) {
      return {
        valid: false,
        error: `${isBranch ? 'Branch' : 'Reference'} name cannot contain whitespace or control characters.`,
      };
    }

    // Validate using git check-ref-format
    const checkArgs = isBranch
      ? ['check-ref-format', '--branch', trimmed]
      : ['check-ref-format', '--allow-onelevel', trimmed];

    try {
      const res = await repository.exec(checkArgs);
      if (res.exitCode === 0) {
        return {
          valid: true,
          normalizedRef: res.stdout.trim() || trimmed,
        };
      }
    } catch {
      // Command failed => invalid format
    }

    return {
      valid: false,
      error: `'${trimmed}' is not a valid ${isBranch ? 'branch' : 'reference'} name according to Git naming rules.`,
    };
  }

  /**
   * Checks whether a local branch exists in refs/heads.
   */
  public async branchExists(repository: GitRepository, branchName: string): Promise<boolean> {
    if (!branchName || branchName.startsWith('-')) {
      return false;
    }
    try {
      const res = await repository.exec([
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${branchName}`,
      ]);
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Validates a tag name against the exact refs/tags namespace used by Git.
   */
  public async validateTagName(
    repository: GitRepository,
    tagName: string,
  ): Promise<RefValidationResult> {
    const trimmed = tagName ? tagName.trim() : '';

    if (!trimmed) {
      return { valid: false, error: 'Tag name cannot be empty.' };
    }
    if (trimmed.startsWith('-')) {
      return { valid: false, error: "Tag name cannot start with a dash ('-')." };
    }
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f\s]/.test(trimmed)) {
      return {
        valid: false,
        error: 'Tag name cannot contain whitespace or control characters.',
      };
    }

    try {
      const res = await repository.exec(['check-ref-format', `refs/tags/${trimmed}`]);
      if (res.exitCode === 0) {
        return { valid: true, normalizedRef: trimmed };
      }
    } catch {
      // Command failed => invalid format
    }

    return {
      valid: false,
      error: `'${trimmed}' is not a valid tag name according to Git naming rules.`,
    };
  }

  /**
   * Checks whether a tag exists in refs/tags.
   */
  public async tagExists(repository: GitRepository, tagName: string): Promise<boolean> {
    if (!tagName || tagName.startsWith('-')) {
      return false;
    }
    try {
      const res = await repository.exec([
        'show-ref',
        '--verify',
        '--quiet',
        `refs/tags/${tagName}`,
      ]);
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Executes the complete preflight check sequence against specified requirements.
   */
  public async run(
    repository: GitRepository,
    requirements: PreflightRequirements = {},
  ): Promise<PreflightResult> {
    const isBare = repository.isBare;

    // 1. Bare repository check
    if (requirements.disallowBare !== false && isBare) {
      const err = new AppError(
        AppErrorCode.GIT_COMMAND_FAILED,
        'Operation cannot be performed on a bare Git repository.',
      );
      return {
        passed: false,
        repositoryExists: true,
        isBare: true,
        workingTree: {
          isClean: true,
          hasStagedChanges: false,
          hasUnstagedChanges: false,
          hasUntrackedFiles: false,
          dirtyFileCount: 0,
          modifiedFiles: [],
        },
        head: { isDetached: false },
        error: err,
      };
    }

    // 2. Working tree check
    let workingTree: WorkingTreeStatus;
    try {
      workingTree = isBare
        ? {
            isClean: true,
            hasStagedChanges: false,
            hasUnstagedChanges: false,
            hasUntrackedFiles: false,
            dirtyFileCount: 0,
            modifiedFiles: [],
          }
        : await this.checkWorkingTree(repository);
    } catch (error: unknown) {
      return {
        passed: false,
        repositoryExists: true,
        isBare,
        workingTree: {
          isClean: false,
          hasStagedChanges: false,
          hasUnstagedChanges: false,
          hasUntrackedFiles: false,
          dirtyFileCount: 0,
          modifiedFiles: [],
        },
        head: { isDetached: false },
        error: AppError.from(error, AppErrorCode.GIT_COMMAND_FAILED),
      };
    }

    if (requirements.requireCleanWorktree && !workingTree.isClean) {
      const err = new AppError(
        AppErrorCode.DIRTY_WORKTREE,
        'Your working tree has uncommitted changes. Please commit, stash, or discard them before proceeding.',
        { modifiedFiles: workingTree.modifiedFiles },
      );
      return {
        passed: false,
        repositoryExists: true,
        isBare,
        workingTree,
        head: { isDetached: false },
        error: err,
      };
    }

    // 3. Head check
    const head = await this.checkHead(repository);
    if (requirements.allowDetachedHead === false && head.isDetached) {
      const err = new AppError(
        AppErrorCode.GIT_COMMAND_FAILED,
        'Operation requires a checked-out branch, but repository is in detached HEAD state.',
      );
      return {
        passed: false,
        repositoryExists: true,
        isBare,
        workingTree,
        head,
        error: err,
      };
    }

    // 4. Branch name validation
    if (requirements.validateBranchName !== undefined) {
      const branchValidation = await this.validateRefName(
        repository,
        requirements.validateBranchName,
        true,
      );
      if (!branchValidation.valid) {
        return {
          passed: false,
          repositoryExists: true,
          isBare,
          workingTree,
          head,
          refValidation: branchValidation,
          error: new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            branchValidation.error || 'Invalid branch name.',
          ),
        };
      }
    }

    // 5. Ref name validation
    if (requirements.validateRefName !== undefined) {
      const refValidation = await this.validateRefName(
        repository,
        requirements.validateRefName,
        false,
      );
      if (!refValidation.valid) {
        return {
          passed: false,
          repositoryExists: true,
          isBare,
          workingTree,
          head,
          refValidation,
          error: new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            refValidation.error || 'Invalid reference name.',
          ),
        };
      }
    }

    // 6. Tag name validation
    if (requirements.validateTagName !== undefined) {
      const tagValidation = await this.validateTagName(repository, requirements.validateTagName);
      if (!tagValidation.valid) {
        return {
          passed: false,
          repositoryExists: true,
          isBare,
          workingTree,
          head,
          refValidation: tagValidation,
          error: new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            tagValidation.error || 'Invalid tag name.',
          ),
        };
      }
    }

    // 7. Branch must not exist check (e.g. create branch)
    if (requirements.checkBranchMustNotExist !== undefined) {
      const exists = await this.branchExists(repository, requirements.checkBranchMustNotExist);
      if (exists) {
        return {
          passed: false,
          repositoryExists: true,
          isBare,
          workingTree,
          head,
          error: new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            `A branch named '${requirements.checkBranchMustNotExist}' already exists. Please choose a different name.`,
          ),
        };
      }
    }

    // 8. Branch must exist check (e.g. checkout existing branch)
    if (requirements.checkBranchMustExist !== undefined) {
      const exists = await this.branchExists(repository, requirements.checkBranchMustExist);
      if (!exists) {
        return {
          passed: false,
          repositoryExists: true,
          isBare,
          workingTree,
          head,
          error: new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            `Branch '${requirements.checkBranchMustExist}' does not exist in the repository.`,
          ),
        };
      }
    }

    // 9. Tag must not exist check (e.g. create tag)
    if (requirements.checkTagMustNotExist !== undefined) {
      const exists = await this.tagExists(repository, requirements.checkTagMustNotExist);
      if (exists) {
        return {
          passed: false,
          repositoryExists: true,
          isBare,
          workingTree,
          head,
          error: new AppError(
            AppErrorCode.GIT_COMMAND_FAILED,
            `A tag named '${requirements.checkTagMustNotExist}' already exists. Please choose a different name.`,
          ),
        };
      }
    }

    return {
      passed: true,
      repositoryExists: true,
      isBare,
      workingTree,
      head,
    };
  }
}
