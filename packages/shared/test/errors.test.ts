import { describe, it, expect } from 'vitest';
import { AppError, AppErrorCode, AppErrorCodeSchema, SerializedAppErrorSchema } from '../src/index';

describe('AppError and Error Codes', () => {
  it('defines all standard error codes required by M0.4', () => {
    expect(AppErrorCode.GIT_NOT_FOUND).toBe('GIT_NOT_FOUND');
    expect(AppErrorCode.NOT_A_REPOSITORY).toBe('NOT_A_REPOSITORY');
    expect(AppErrorCode.DIRTY_WORKTREE).toBe('DIRTY_WORKTREE');
    expect(AppErrorCode.GIT_COMMAND_FAILED).toBe('GIT_COMMAND_FAILED');
    expect(AppErrorCode.INVALID_MESSAGE).toBe('INVALID_MESSAGE');
    expect(AppErrorCode.OPERATION_CANCELLED).toBe('OPERATION_CANCELLED');
    expect(AppErrorCode.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR');

    expect(AppErrorCodeSchema.safeParse('GIT_NOT_FOUND').success).toBe(true);
    expect(AppErrorCodeSchema.safeParse('INVALID_ERROR_CODE').success).toBe(false);
  });

  it('creates an AppError instance with code, message, and details', () => {
    const error = new AppError(
      AppErrorCode.DIRTY_WORKTREE,
      'Cannot switch branch with dirty working tree',
      { modifiedFiles: ['src/App.tsx'] },
      true,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe(AppErrorCode.DIRTY_WORKTREE);
    expect(error.message).toBe('Cannot switch branch with dirty working tree');
    expect(error.details).toEqual({ modifiedFiles: ['src/App.tsx'] });
    expect(error.fatal).toBe(true);
  });

  it('serializes to JSON format matching SerializedAppErrorSchema', () => {
    const error = new AppError(AppErrorCode.GIT_COMMAND_FAILED, 'git checkout failed', {
      stderr: 'error: pathspec not found',
    });

    const json = error.toJSON();
    expect(json.code).toBe('GIT_COMMAND_FAILED');
    expect(json.message).toBe('git checkout failed');
    expect(json.details).toEqual({ stderr: 'error: pathspec not found' });

    const parsed = SerializedAppErrorSchema.safeParse(json);
    expect(parsed.success).toBe(true);
  });

  it('converts unknown errors using AppError.from()', () => {
    // 1. If already AppError, returns as-is
    const existing = new AppError(AppErrorCode.NOT_A_REPOSITORY, 'No repo');
    expect(AppError.from(existing)).toBe(existing);

    // 2. Standard Error
    const standardErr = new Error('Disk error');
    const convertedFromError = AppError.from(standardErr, AppErrorCode.GIT_NOT_FOUND);
    expect(convertedFromError.code).toBe(AppErrorCode.GIT_NOT_FOUND);
    expect(convertedFromError.message).toBe('Disk error');

    // 3. String
    const convertedFromString = AppError.from('Something went wrong');
    expect(convertedFromString.code).toBe(AppErrorCode.UNKNOWN_ERROR);
    expect(convertedFromString.message).toBe('Something went wrong');

    // 4. Unknown object
    const convertedFromObj = AppError.from({ custom: 123 });
    expect(convertedFromObj.code).toBe(AppErrorCode.UNKNOWN_ERROR);
    expect(convertedFromObj.message).toBe('An unexpected error occurred');
    expect(convertedFromObj.details).toEqual({ custom: 123 });
  });
});
