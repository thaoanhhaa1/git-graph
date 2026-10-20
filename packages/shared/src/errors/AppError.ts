import { z } from 'zod';

export const AppErrorCode = {
  GIT_NOT_FOUND: 'GIT_NOT_FOUND',
  NOT_A_REPOSITORY: 'NOT_A_REPOSITORY',
  DIRTY_WORKTREE: 'DIRTY_WORKTREE',
  GIT_COMMAND_FAILED: 'GIT_COMMAND_FAILED',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  OPERATION_CANCELLED: 'OPERATION_CANCELLED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type AppErrorCode = (typeof AppErrorCode)[keyof typeof AppErrorCode];

export const AppErrorCodeSchema = z.enum([
  'GIT_NOT_FOUND',
  'NOT_A_REPOSITORY',
  'DIRTY_WORKTREE',
  'GIT_COMMAND_FAILED',
  'INVALID_MESSAGE',
  'OPERATION_CANCELLED',
  'UNKNOWN_ERROR',
]);

export interface SerializedAppError {
  code: AppErrorCode;
  message: string;
  details?: unknown;
  fatal?: boolean;
}

export const SerializedAppErrorSchema = z.object({
  code: AppErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
  fatal: z.boolean().optional(),
});

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly details?: unknown;
  public readonly fatal?: boolean;

  constructor(code: AppErrorCode, message: string, details?: unknown, fatal?: boolean) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.fatal = fatal;

    // Maintain proper stack trace in V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  public toJSON(): SerializedAppError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
      ...(this.fatal !== undefined ? { fatal: this.fatal } : {}),
    };
  }

  public static from(
    err: unknown,
    defaultCode: AppErrorCode = AppErrorCode.UNKNOWN_ERROR,
  ): AppError {
    if (err instanceof AppError) {
      return err;
    }
    if (err instanceof Error) {
      return new AppError(defaultCode, err.message, { stack: err.stack });
    }
    if (typeof err === 'string') {
      return new AppError(defaultCode, err);
    }
    return new AppError(defaultCode, 'An unexpected error occurred', err);
  }
}
