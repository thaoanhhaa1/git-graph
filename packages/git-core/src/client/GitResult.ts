/**
 * Sanitizes command-line arguments to mask secrets, credentials, and sensitive headers.
 */
export function sanitizeGitArgs(args: readonly string[]): string[] {
  return args.map((arg) => {
    // Mask URLs with credentials: https://user:password@domain.com/...
    let sanitized = arg.replace(/([a-zA-Z0-9+.-]+:\/\/)([^:]+):([^@]+)@/g, '$1$2:***@');

    // Mask Authorization headers in git -c http.extraheader
    sanitized = sanitized.replace(
      /(http\.extraheader=(?:AUTHORIZATION|Authorization):\s*(?:bearer\s+|basic\s+)?)[^\s"']+/gi,
      '$1***',
    );

    // Mask password flags: --password=secret, password=secret
    sanitized = sanitized.replace(/(--password=)[^\s"']+/gi, '$1***');
    sanitized = sanitized.replace(/(password=)[^\s"']+/gi, '$1***');

    return sanitized;
  });
}

/**
 * Builds a human-readable, safe command string for logging and error reporting.
 */
export function formatSanitizedCommand(executable: string, args: readonly string[]): string {
  const sanitizedArgs = sanitizeGitArgs(args);
  const quotedArgs = sanitizedArgs.map((arg) => {
    if (arg.length === 0) {
      return '""';
    }
    if (/[ \t\n\r"'$`\\]/.test(arg)) {
      return `"${arg.replace(/"/g, '\\"')}"`;
    }
    return arg;
  });

  return [executable, ...quotedArgs].join(' ');
}

/**
 * Result returned from a successful Git command execution.
 */
export interface GitResult {
  /**
   * Decoded stdout string.
   */
  readonly stdout: string;

  /**
   * Decoded stderr string.
   */
  readonly stderr: string;

  /**
   * Command exit code (0 for success).
   */
  readonly exitCode: number;

  /**
   * Termination signal if process was terminated by a signal.
   */
  readonly signal?: NodeJS.Signals | string | null;

  /**
   * Raw Buffer of stdout stream.
   */
  readonly stdoutBuffer: Buffer;

  /**
   * Raw Buffer of stderr stream.
   */
  readonly stderrBuffer: Buffer;

  /**
   * Execution duration in milliseconds.
   */
  readonly durationMs: number;

  /**
   * Human-readable, sanitized command line representation.
   */
  readonly command: string;

  /**
   * Sanitized command arguments.
   */
  readonly args: readonly string[];
}
