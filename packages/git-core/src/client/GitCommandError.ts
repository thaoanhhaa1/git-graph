import { AppError, AppErrorCode } from '@git-graph/shared';

export interface GitCommandErrorOptions {
  command: string;
  args: readonly string[];
  exitCode?: number | null;
  signal?: NodeJS.Signals | string | null;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
  isTimeout?: boolean;
  isCancelled?: boolean;
  isMaxOutputExceeded?: boolean;
  code?: AppErrorCode;
}

/**
 * Standard error thrown when a Git command fails, times out, is aborted,
 * or the Git binary is not found.
 */
export class GitCommandError extends AppError {
  public readonly command: string;
  public readonly args: readonly string[];
  public readonly exitCode: number | null;
  public readonly signal: NodeJS.Signals | string | null;
  public readonly stdout: string;
  public readonly stderr: string;
  public readonly durationMs: number;
  public readonly isTimeout: boolean;
  public readonly isCancelled: boolean;
  public readonly isMaxOutputExceeded: boolean;

  constructor(message: string, options: GitCommandErrorOptions) {
    const code =
      options.code ??
      (options.isCancelled ? AppErrorCode.OPERATION_CANCELLED : AppErrorCode.GIT_COMMAND_FAILED);

    super(
      code,
      message,
      {
        command: options.command,
        args: options.args,
        exitCode: options.exitCode ?? null,
        signal: options.signal ?? null,
        stdout: options.stdout ?? '',
        stderr: options.stderr ?? '',
        durationMs: options.durationMs ?? 0,
        isTimeout: Boolean(options.isTimeout),
        isCancelled: Boolean(options.isCancelled),
        isMaxOutputExceeded: Boolean(options.isMaxOutputExceeded),
      },
      false,
    );

    this.name = 'GitCommandError';
    this.command = options.command;
    this.args = options.args;
    this.exitCode = options.exitCode ?? null;
    this.signal = options.signal ?? null;
    this.stdout = options.stdout ?? '';
    this.stderr = options.stderr ?? '';
    this.durationMs = options.durationMs ?? 0;
    this.isTimeout = Boolean(options.isTimeout);
    this.isCancelled = Boolean(options.isCancelled);
    this.isMaxOutputExceeded = Boolean(options.isMaxOutputExceeded);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GitCommandError);
    }
  }
}
