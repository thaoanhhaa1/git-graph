import { AppErrorCode, type SerializedAppError } from '@git-graph/shared';
import { sanitizeGitArgs, formatSanitizedCommand } from '@git-graph/git-core';

/**
 * Sanitized command metadata for safe logging and telemetry.
 */
export interface OperationCommandMetadata {
  command: string;
  args: readonly string[];
  durationMs?: number;
}

/**
 * Progress callback passed to operations.
 */
export type OperationProgressCallback = (progress: number, message?: string) => void;

/**
 * Detailed execution result of a Git operation.
 */
export interface OperationExecutionResult<T = unknown> {
  operationId: string;
  repositoryId: string;
  success: boolean;
  data?: T;
  error?: SerializedAppError;
  actionableMessage?: string;
  sanitizedStderr?: string;
  commandMetadata?: OperationCommandMetadata;
  durationMs?: number;
}

/**
 * Masks secrets, tokens, credentials, and sensitive patterns in arbitrary strings (e.g. stderr).
 */
export function sanitizeStderr(stderr: string): string {
  if (!stderr) {
    return '';
  }

  // 1. Remove ANSI escape sequences (terminal color codes)
  // eslint-disable-next-line no-control-regex
  let cleaned = stderr.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');

  // 2. Mask URLs with credentials (e.g. https://user:password@github.com)
  cleaned = cleaned.replace(/([a-zA-Z0-9+.-]+:\/\/)([^:\s]+):([^@\s]+)@/g, '$1$2:***@');

  // 3. Mask GitHub personal access tokens
  cleaned = cleaned.replace(/\b(ghp_[a-zA-Z0-9]{36,})\b/g, 'ghp_***');
  cleaned = cleaned.replace(/\b(github_pat_[a-zA-Z0-9_]{22,})\b/g, 'github_pat_***');

  // 4. Mask GitLab personal access tokens
  cleaned = cleaned.replace(/\b(glpat-[a-zA-Z0-9\-_]{20,})\b/g, 'glpat-***');

  // 5. Mask generic Bearer tokens
  cleaned = cleaned.replace(/(Bearer\s+)[a-zA-Z0-9\-._~+/]+=*/gi, '$1***');

  // 6. Mask basic password key-value patterns in messages
  cleaned = cleaned.replace(/(password\s*[:=]\s*)[^\s,;]+/gi, '$1***');

  return cleaned.trim();
}

/**
 * Builds sanitized command metadata without credentials or secrets.
 */
export function sanitizeGitCommandMetadata(
  executable: string,
  args: readonly string[],
  durationMs?: number,
): OperationCommandMetadata {
  const sanitizedArgs = sanitizeGitArgs(args);
  const command = formatSanitizedCommand(executable, args);

  return {
    command,
    args: sanitizedArgs,
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

export interface ActionableErrorMapping {
  code: AppErrorCode;
  message: string;
  actionableMessage: string;
}

/**
 * Analyzes Git stderr output or error object and translates standard Git errors
 * into actionable, user-friendly instructions.
 */
export function mapErrorToActionableMessage(
  errorOrStderr: unknown,
  fallbackMessage?: string,
): ActionableErrorMapping {
  let rawMessage = '';
  if (typeof errorOrStderr === 'string') {
    rawMessage = errorOrStderr;
  } else if (errorOrStderr && typeof errorOrStderr === 'object') {
    const errObj = errorOrStderr as { stderr?: string; message?: string; name?: string };
    rawMessage = errObj.stderr || errObj.message || '';
  }

  const clean = sanitizeStderr(rawMessage);

  // If already an AppError or object with AppErrorCode, preserve its code and message
  if (
    errorOrStderr &&
    typeof errorOrStderr === 'object' &&
    'code' in errorOrStderr &&
    typeof (errorOrStderr as { code: unknown }).code === 'string'
  ) {
    const appErr = errorOrStderr as { code: AppErrorCode; message: string; details?: unknown };
    return {
      code: appErr.code,
      message: appErr.message,
      actionableMessage: appErr.message,
    };
  }

  // Check for cancellation
  if (
    errorOrStderr &&
    typeof errorOrStderr === 'object' &&
    'name' in errorOrStderr &&
    (errorOrStderr as { name: string }).name === 'AbortError'
  ) {
    return {
      code: AppErrorCode.OPERATION_CANCELLED,
      message: 'Operation was cancelled.',
      actionableMessage: 'The Git operation was cancelled.',
    };
  }

  if (
    /cancelled|canceled|abort(ed)?/i.test(clean) &&
    !/fatal: (checkout|merge) abort/i.test(clean)
  ) {
    return {
      code: AppErrorCode.OPERATION_CANCELLED,
      message: clean || 'Operation was cancelled.',
      actionableMessage: 'The Git operation was cancelled.',
    };
  }

  // Dirty working tree conflict
  if (
    /Your local changes to the following files would be overwritten/i.test(clean) ||
    /The following untracked working tree files would be overwritten/i.test(clean)
  ) {
    return {
      code: AppErrorCode.DIRTY_WORKTREE,
      message: clean,
      actionableMessage:
        'Your working tree has uncommitted or conflicting changes that would be overwritten. Please commit, stash, or discard them before switching branches.',
    };
  }

  // Branch already exists
  const branchExistsMatch = /fatal:\s*A branch named '([^']+)' already exists/i.exec(clean);
  if (branchExistsMatch) {
    const branchName = branchExistsMatch[1];
    return {
      code: AppErrorCode.GIT_COMMAND_FAILED,
      message: clean,
      actionableMessage: `A branch named '${branchName}' already exists. Please choose a different branch name or check out the existing branch.`,
    };
  }

  // Tag already exists
  const tagExistsMatch = /fatal:\s*tag '([^']+)' already exists/i.exec(clean);
  if (tagExistsMatch) {
    const tagName = tagExistsMatch[1];
    return {
      code: AppErrorCode.GIT_COMMAND_FAILED,
      message: clean,
      actionableMessage: `A tag named '${tagName}' already exists. Please choose a different tag name.`,
    };
  }

  // Invalid branch name
  const invalidBranchMatch = /fatal:\s*'([^']+)' is not a valid branch name/i.exec(clean);
  if (invalidBranchMatch) {
    const name = invalidBranchMatch[1];
    return {
      code: AppErrorCode.GIT_COMMAND_FAILED,
      message: clean,
      actionableMessage: `'${name}' is not a valid branch name according to Git naming rules. Avoid spaces, tildes, carets, colons, or leading dashes.`,
    };
  }

  // Invalid ref name
  const invalidRefMatch = /fatal:\s*'([^']+)' is not a valid ref name/i.exec(clean);
  if (invalidRefMatch) {
    const name = invalidRefMatch[1];
    return {
      code: AppErrorCode.GIT_COMMAND_FAILED,
      message: clean,
      actionableMessage: `'${name}' is not a valid reference name according to Git ref rules.`,
    };
  }

  // Git index lock exists
  if (/fatal:\s*Unable to create '.*\.git\/index\.lock': File exists/i.test(clean)) {
    return {
      code: AppErrorCode.GIT_COMMAND_FAILED,
      message: clean,
      actionableMessage:
        'Another Git process seems to be running in this repository (index.lock file exists). Please wait for it to complete or remove the stale lock file.',
    };
  }

  // Not a git repository
  if (/fatal:\s*not a git repository/i.test(clean)) {
    return {
      code: AppErrorCode.NOT_A_REPOSITORY,
      message: clean,
      actionableMessage: 'The specified directory is not a valid Git repository.',
    };
  }

  // Cannot force update/delete current branch
  if (/fatal:\s*Cannot (?:force update|delete) the current branch/i.test(clean)) {
    return {
      code: AppErrorCode.GIT_COMMAND_FAILED,
      message: clean,
      actionableMessage:
        'Cannot modify or delete the currently checked-out branch. Switch to another branch first.',
    };
  }

  // Already checked out in another worktree
  const worktreeMatch = /fatal:\s*'([^']+)' is already checked out at '([^']+)'/i.exec(clean);
  if (worktreeMatch) {
    const branch = worktreeMatch[1];
    const path = worktreeMatch[2];
    return {
      code: AppErrorCode.GIT_COMMAND_FAILED,
      message: clean,
      actionableMessage: `Branch '${branch}' is already checked out in another worktree at '${path}'.`,
    };
  }

  // Pathspec did not match
  const pathspecMatch =
    /error:\s*pathspec '([^']+)' did not match any file\(s\) known to git/i.exec(clean);
  if (pathspecMatch) {
    const target = pathspecMatch[1];
    return {
      code: AppErrorCode.GIT_COMMAND_FAILED,
      message: clean,
      actionableMessage: `Reference or path '${target}' was not found in the repository.`,
    };
  }

  // Reference is not a tree / not a valid object name
  if (
    /fatal:\s*reference is not a tree/i.test(clean) ||
    /fatal:\s*Not a valid object name/i.test(clean)
  ) {
    return {
      code: AppErrorCode.GIT_COMMAND_FAILED,
      message: clean,
      actionableMessage: 'The specified commit or reference does not exist in this repository.',
    };
  }

  // Default fallback
  const message = clean || fallbackMessage || 'An unexpected Git error occurred.';
  return {
    code: AppErrorCode.GIT_COMMAND_FAILED,
    message,
    actionableMessage: message,
  };
}

/**
 * Creates an OperationExecutionResult indicating success.
 */
export function createOperationSuccessResult<T>(
  operationId: string,
  repositoryId: string,
  data?: T,
  commandMetadata?: OperationCommandMetadata,
  durationMs?: number,
): OperationExecutionResult<T> {
  return {
    operationId,
    repositoryId,
    success: true,
    data,
    commandMetadata,
    durationMs,
  };
}

/**
 * Creates an OperationExecutionResult indicating failure.
 */
export function createOperationFailureResult(
  operationId: string,
  repositoryId: string,
  errorOrStderr: unknown,
  commandMetadata?: OperationCommandMetadata,
  durationMs?: number,
): OperationExecutionResult<never> {
  const mapped = mapErrorToActionableMessage(errorOrStderr);
  const rawStderr =
    typeof errorOrStderr === 'string'
      ? errorOrStderr
      : (errorOrStderr as { stderr?: string })?.stderr || '';
  const sanitizedStderr = sanitizeStderr(rawStderr);
  const appErrorDetails =
    errorOrStderr &&
    typeof errorOrStderr === 'object' &&
    'code' in errorOrStderr &&
    'details' in errorOrStderr
      ? (errorOrStderr as { details?: unknown }).details
      : undefined;
  const structuredDetails =
    appErrorDetails && typeof appErrorDetails === 'object' && !Array.isArray(appErrorDetails)
      ? appErrorDetails
      : appErrorDetails !== undefined
        ? { appDetails: appErrorDetails }
        : {};

  const error: SerializedAppError = {
    code: mapped.code,
    message: mapped.actionableMessage,
    details: {
      ...structuredDetails,
      rawMessage: mapped.message,
      sanitizedStderr: sanitizedStderr || undefined,
      command: commandMetadata?.command,
    },
  };

  return {
    operationId,
    repositoryId,
    success: false,
    error,
    actionableMessage: mapped.actionableMessage,
    sanitizedStderr,
    commandMetadata,
    durationMs,
  };
}
