import { GitResult } from './GitResult';

/**
 * Execution options for running a Git command.
 */
export interface GitExecutionOptions {
  /**
   * Working directory where the Git command will be executed.
   */
  cwd?: string;

  /**
   * Additional or overridden environment variables.
   */
  env?: Record<string, string | undefined>;

  /**
   * Input to pipe into standard input of the Git process.
   */
  stdin?: string | Buffer;

  /**
   * Timeout in milliseconds. If exceeded, the process is killed.
   */
  timeoutMs?: number;

  /**
   * Maximum combined bytes for stdout + stderr before terminating the command.
   */
  maxBufferBytes?: number;

  /**
   * AbortSignal to cancel command execution.
   */
  signal?: AbortSignal;

  /**
   * Text encoding used to decode stdout and stderr buffers (default 'utf-8').
   */
  encoding?: BufferEncoding;
}

/**
 * Convenience alias for {@link GitExecutionOptions}.
 */
export type GitExecOptions = GitExecutionOptions;

/**
 * Parsed Git version metadata.
 */
export interface GitVersion {
  /**
   * Raw version string returned by `git --version`.
   */
  raw: string;

  /**
   * Major version number.
   */
  major: number;

  /**
   * Minor version number.
   */
  minor: number;

  /**
   * Patch version number.
   */
  patch: number;

  /**
   * Windows-specific Git package revision if running Git for Windows.
   */
  windowsVersion?: number;
}

/**
 * Detected Git executable metadata.
 */
export interface GitExecutableInfo {
  /**
   * Path or command name of the Git executable.
   */
  path: string;

  /**
   * Version information of the detected Git executable.
   */
  version: GitVersion;
}

/**
 * Interface representing a client for executing Git commands.
 */
export interface GitClient {
  /**
   * Path to the Git executable being used.
   */
  readonly gitPath: string;

  /**
   * Queries and parses the version of the Git executable.
   */
  getVersion(): Promise<GitVersion>;

  /**
   * Executes a Git command with an array of arguments and execution options.
   *
   * @param args Command arguments (e.g. `['rev-parse', '--show-toplevel']`).
   * @param options Execution configuration options.
   * @throws {GitCommandError} If command exits with non-zero status, times out, is aborted, or binary is not found.
   */
  exec(args: readonly string[], options?: GitExecutionOptions): Promise<GitResult>;
}
