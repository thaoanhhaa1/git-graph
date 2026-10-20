import { spawn, ChildProcess } from 'node:child_process';

/**
 * Low-level execution options passed to a ProcessRunner.
 */
export interface ProcessRunOptions {
  executable: string;
  args: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string | Buffer;
  timeoutMs?: number;
  maxBufferBytes?: number;
  signal?: AbortSignal;
}

/**
 * Raw output produced by a ProcessRunner.
 */
export interface ProcessOutput {
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | string | null;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly maxOutputExceeded: boolean;
}

/**
 * Adapter interface for executing system processes.
 * Allows injecting fake or mock runners in tests without spawning real processes.
 */
export interface ProcessRunner {
  run(options: ProcessRunOptions): Promise<ProcessOutput>;
}

/**
 * Default Node.js child_process spawn-based runner.
 * Guarantees shell: false to prevent command injection,
 * uses Buffer streams to preserve Unicode / binary boundaries,
 * and manages timeouts, cancellation, and max buffer limits.
 */
export class DefaultProcessRunner implements ProcessRunner {
  public run(options: ProcessRunOptions): Promise<ProcessOutput> {
    return new Promise<ProcessOutput>((resolve, reject) => {
      // Early check if signal was already aborted before spawning
      if (options.signal?.aborted) {
        resolve({
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
          exitCode: null,
          signal: 'SIGTERM',
          durationMs: 0,
          timedOut: false,
          cancelled: true,
          maxOutputExceeded: false,
        });
        return;
      }

      const startTime = Date.now();
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let totalStdoutBytes = 0;
      let totalStderrBytes = 0;

      let timedOut = false;
      let cancelled = false;
      let maxOutputExceeded = false;
      let timeoutTimer: NodeJS.Timeout | null = null;
      let forceKillTimer: NodeJS.Timeout | null = null;

      let child: ChildProcess;

      try {
        child = spawn(options.executable, [...options.args], {
          cwd: options.cwd,
          env: {
            GIT_TERMINAL_PROMPT: '0',
            ...process.env,
            ...options.env,
          },
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        reject(err);
        return;
      }

      const killProcess = (sig: NodeJS.Signals = 'SIGTERM') => {
        try {
          if (!child.killed) {
            child.kill(sig);
          }
        } catch {
          // Process may have already exited
        }
      };

      const cleanup = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        if (forceKillTimer) {
          clearTimeout(forceKillTimer);
          forceKillTimer = null;
        }
        if (options.signal) {
          options.signal.removeEventListener('abort', onAbort);
        }
      };

      const onAbort = () => {
        cancelled = true;
        killProcess('SIGTERM');
        forceKillTimer = setTimeout(() => {
          killProcess('SIGKILL');
        }, 500);
        forceKillTimer.unref();
      };

      if (options.signal) {
        options.signal.addEventListener('abort', onAbort, { once: true });
      }

      if (options.timeoutMs && options.timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          timedOut = true;
          killProcess('SIGTERM');
          forceKillTimer = setTimeout(() => {
            killProcess('SIGKILL');
          }, 500);
          forceKillTimer.unref();
        }, options.timeoutMs);
      }

      // Handle stdin if provided
      if (options.stdin !== undefined && child.stdin) {
        child.stdin.on('error', (_err) => {
          // Ignore EPIPE or broken pipe errors if child exits early
        });
        child.stdin.end(options.stdin);
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        totalStdoutBytes += chunk.length;
        if (
          options.maxBufferBytes &&
          totalStdoutBytes + totalStderrBytes > options.maxBufferBytes
        ) {
          maxOutputExceeded = true;
          killProcess('SIGKILL');
          return;
        }
        stdoutChunks.push(chunk);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        totalStderrBytes += chunk.length;
        if (
          options.maxBufferBytes &&
          totalStdoutBytes + totalStderrBytes > options.maxBufferBytes
        ) {
          maxOutputExceeded = true;
          killProcess('SIGKILL');
          return;
        }
        stderrChunks.push(chunk);
      });

      child.on('error', (err) => {
        cleanup();
        reject(err);
      });

      child.on('close', (exitCode, signal) => {
        cleanup();
        const durationMs = Date.now() - startTime;
        resolve({
          stdout: Buffer.concat(stdoutChunks),
          stderr: Buffer.concat(stderrChunks),
          exitCode,
          signal,
          durationMs,
          timedOut,
          cancelled,
          maxOutputExceeded,
        });
      });
    });
  }
}
