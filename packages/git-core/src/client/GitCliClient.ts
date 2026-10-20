import { AppError, AppErrorCode } from '@git-graph/shared';
import { GitClient, GitExecutionOptions, GitExecutableInfo, GitVersion } from './GitClient';
import { GitCommandError } from './GitCommandError';
import { GitCommandMaxBufferBytes, GitCommandTimeoutMs } from './GitExecutionDefaults';
import { GitResult, formatSanitizedCommand, sanitizeGitArgs } from './GitResult';
import { DefaultProcessRunner, ProcessRunner } from './ProcessRunner';

/**
 * CLI-based implementation of GitClient that executes the Git binary.
 */
export class GitCliClient implements GitClient {
  public readonly gitPath: string;
  private readonly runner: ProcessRunner;

  constructor(gitPath = 'git', runner: ProcessRunner = new DefaultProcessRunner()) {
    this.gitPath = gitPath;
    this.runner = runner;
  }

  /**
   * Parses the version string produced by `git --version`.
   */
  public static parseVersion(versionString: string): GitVersion {
    const raw = versionString.trim();
    // Handles formats like:
    // "git version 2.43.0"
    // "git version 2.39.3 (Apple Git-146)"
    // "git version 2.45.2.windows.1"
    const match = /git\s+version\s+(\d+)\.(\d+)(?:\.(\d+))?(?:\.windows\.(\d+))?/i.exec(raw);

    if (!match) {
      return {
        raw,
        major: 0,
        minor: 0,
        patch: 0,
      };
    }

    const major = parseInt(match[1] ?? '0', 10);
    const minor = parseInt(match[2] ?? '0', 10);
    const patch = parseInt(match[3] ?? '0', 10);
    const windowsVersion = match[4] ? parseInt(match[4], 10) : undefined;

    return {
      raw,
      major,
      minor,
      patch,
      ...(windowsVersion !== undefined ? { windowsVersion } : {}),
    };
  }

  /**
   * Attempts to discover a working Git executable.
   * Tests the provided candidate path first, then falls back to PATH and standard OS locations.
   */
  public static async detect(
    candidatePath?: string,
    runner: ProcessRunner = new DefaultProcessRunner(),
  ): Promise<GitExecutableInfo> {
    const candidates: string[] = [];

    if (candidatePath && candidatePath.trim().length > 0) {
      candidates.push(candidatePath.trim());
    }

    candidates.push('git');

    if (process.platform === 'win32') {
      const localAppData = process.env['LOCALAPPDATA'];
      if (localAppData) {
        candidates.push(`${localAppData}\\Programs\\Git\\cmd\\git.exe`);
      }
      candidates.push('C:\\Program Files\\Git\\cmd\\git.exe');
      candidates.push('C:\\Program Files (x86)\\Git\\cmd\\git.exe');
    } else {
      candidates.push('/usr/bin/git');
      candidates.push('/usr/local/bin/git');
      candidates.push('/opt/homebrew/bin/git');
    }

    // Deduplicate candidate paths
    const uniqueCandidates = Array.from(new Set(candidates));

    for (const path of uniqueCandidates) {
      try {
        const client = new GitCliClient(path, runner);
        const version = await client.getVersion();
        if (version.major > 0 || version.raw.length > 0) {
          return { path, version };
        }
      } catch {
        // Try next candidate
      }
    }

    throw new AppError(
      AppErrorCode.GIT_NOT_FOUND,
      'Git executable could not be found on PATH or standard installation locations.',
    );
  }

  /**
   * Queries and parses Git version.
   */
  public async getVersion(): Promise<GitVersion> {
    const result = await this.exec(['--version']);
    return GitCliClient.parseVersion(result.stdout);
  }

  /**
   * Executes a Git command with the provided arguments and options.
   */
  public async exec(args: readonly string[], options?: GitExecutionOptions): Promise<GitResult> {
    const sanitizedCommand = formatSanitizedCommand(this.gitPath, args);
    const sanitizedArgs = sanitizeGitArgs(args);

    if (options?.signal?.aborted) {
      throw new GitCommandError(`Git command cancelled before execution: ${sanitizedCommand}`, {
        command: sanitizedCommand,
        args: sanitizedArgs,
        isCancelled: true,
        code: AppErrorCode.OPERATION_CANCELLED,
      });
    }

    let output;
    try {
      output = await this.runner.run({
        executable: this.gitPath,
        args,
        cwd: options?.cwd,
        env: options?.env,
        stdin: options?.stdin,
        timeoutMs: options?.timeoutMs ?? GitCommandTimeoutMs.normal,
        maxBufferBytes: options?.maxBufferBytes ?? GitCommandMaxBufferBytes.normal,
        signal: options?.signal,
      });
    } catch (err: unknown) {
      const isEnoent = Boolean(
        err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT',
      );

      if (isEnoent) {
        throw new GitCommandError(`Git executable not found at: ${this.gitPath}`, {
          command: sanitizedCommand,
          args: sanitizedArgs,
          code: AppErrorCode.GIT_NOT_FOUND,
        });
      }

      throw new GitCommandError(
        `Failed to spawn Git process: ${err instanceof Error ? err.message : String(err)}`,
        {
          command: sanitizedCommand,
          args: sanitizedArgs,
          code: AppErrorCode.GIT_COMMAND_FAILED,
        },
      );
    }

    const encoding = options?.encoding ?? 'utf-8';
    const stdout = output.stdout.toString(encoding);
    const stderr = output.stderr.toString(encoding);

    if (output.cancelled) {
      throw new GitCommandError(`Git command cancelled: ${sanitizedCommand}`, {
        command: sanitizedCommand,
        args: sanitizedArgs,
        exitCode: output.exitCode,
        signal: output.signal,
        stdout,
        stderr,
        durationMs: output.durationMs,
        isCancelled: true,
        code: AppErrorCode.OPERATION_CANCELLED,
      });
    }

    if (output.timedOut) {
      throw new GitCommandError(
        `Git command timed out after ${options?.timeoutMs ?? 0}ms: ${sanitizedCommand}`,
        {
          command: sanitizedCommand,
          args: sanitizedArgs,
          exitCode: output.exitCode,
          signal: output.signal,
          stdout,
          stderr,
          durationMs: output.durationMs,
          isTimeout: true,
          code: AppErrorCode.GIT_COMMAND_FAILED,
        },
      );
    }

    if (output.maxOutputExceeded) {
      throw new GitCommandError(
        `Git command output exceeded limit of ${options?.maxBufferBytes ?? 0} bytes: ${sanitizedCommand}`,
        {
          command: sanitizedCommand,
          args: sanitizedArgs,
          exitCode: output.exitCode,
          signal: output.signal,
          stdout,
          stderr,
          durationMs: output.durationMs,
          isMaxOutputExceeded: true,
          code: AppErrorCode.GIT_COMMAND_FAILED,
        },
      );
    }

    if (output.exitCode !== 0) {
      const trimmedStderr = stderr.trim();
      const message = trimmedStderr
        ? `Git command failed (exit code ${output.exitCode}): ${sanitizedCommand}\n${trimmedStderr}`
        : `Git command failed (exit code ${output.exitCode}): ${sanitizedCommand}`;

      throw new GitCommandError(message, {
        command: sanitizedCommand,
        args: sanitizedArgs,
        exitCode: output.exitCode,
        signal: output.signal,
        stdout,
        stderr,
        durationMs: output.durationMs,
        code: AppErrorCode.GIT_COMMAND_FAILED,
      });
    }

    return {
      stdout,
      stderr,
      exitCode: 0,
      signal: output.signal,
      stdoutBuffer: output.stdout,
      stderrBuffer: output.stderr,
      durationMs: output.durationMs,
      command: sanitizedCommand,
      args: sanitizedArgs,
    };
  }
}
