import { describe, it, expect, vi } from 'vitest';
import { AppErrorCode } from '@git-graph/shared';
import {
  GitCliClient,
  GitCommandError,
  ProcessRunner,
  ProcessRunOptions,
  ProcessOutput,
  DefaultProcessRunner,
  sanitizeGitArgs,
  formatSanitizedCommand,
} from '../src/index';

/**
 * Fake implementation of ProcessRunner for unit testing without spawning processes.
 */
class FakeProcessRunner implements ProcessRunner {
  public lastOptions?: ProcessRunOptions;
  public mockOutput?: Partial<ProcessOutput>;
  public mockError?: Error;

  constructor(mockOutput?: Partial<ProcessOutput>) {
    this.mockOutput = mockOutput;
  }

  public async run(options: ProcessRunOptions): Promise<ProcessOutput> {
    this.lastOptions = options;

    if (this.mockError) {
      throw this.mockError;
    }

    return {
      stdout: this.mockOutput?.stdout ?? Buffer.from(''),
      stderr: this.mockOutput?.stderr ?? Buffer.from(''),
      exitCode: this.mockOutput?.exitCode ?? 0,
      signal: this.mockOutput?.signal ?? null,
      durationMs: this.mockOutput?.durationMs ?? 15,
      timedOut: this.mockOutput?.timedOut ?? false,
      cancelled: this.mockOutput?.cancelled ?? false,
      maxOutputExceeded: this.mockOutput?.maxOutputExceeded ?? false,
    };
  }
}

describe('GitCliClient - Unit Tests', () => {
  describe('Argument sanitization and command formatting', () => {
    it('masks embedded credentials in remote URLs', () => {
      const args = [
        'clone',
        'https://user:secret123@github.com/repo.git',
        'http://admin:pass456@gitlab.com/repo.git',
      ];
      const sanitized = sanitizeGitArgs(args);
      expect(sanitized[1]).toBe('https://user:***@github.com/repo.git');
      expect(sanitized[2]).toBe('http://admin:***@gitlab.com/repo.git');
    });

    it('masks Authorization headers and password flags', () => {
      const args = [
        '-c',
        'http.extraheader=AUTHORIZATION: bearer ghp_supersecrettoken',
        '--password=mysecretpassword',
        'password=plainpass',
      ];
      const sanitized = sanitizeGitArgs(args);
      expect(sanitized[1]).toBe('http.extraheader=AUTHORIZATION: bearer ***');
      expect(sanitized[2]).toBe('--password=***');
      expect(sanitized[3]).toBe('password=***');
    });

    it('quotes arguments with spaces and special characters when formatting command', () => {
      const formatted = formatSanitizedCommand('git', [
        'commit',
        '-m',
        'feat: initial commit with spaces',
        '--author="John Doe" <john@example.com>',
      ]);
      expect(formatted).toBe(
        'git commit -m "feat: initial commit with spaces" "--author=\\"John Doe\\" <john@example.com>"',
      );
    });
  });

  describe('Version parsing', () => {
    it('parses standard Linux / macOS git version output', () => {
      const v = GitCliClient.parseVersion('git version 2.43.0\n');
      expect(v.major).toBe(2);
      expect(v.minor).toBe(43);
      expect(v.patch).toBe(0);
      expect(v.windowsVersion).toBeUndefined();
    });

    it('parses Apple Git version output', () => {
      const v = GitCliClient.parseVersion('git version 2.39.3 (Apple Git-146)');
      expect(v.major).toBe(2);
      expect(v.minor).toBe(39);
      expect(v.patch).toBe(3);
    });

    it('parses Git for Windows version output', () => {
      const v = GitCliClient.parseVersion('git version 2.45.2.windows.1');
      expect(v.major).toBe(2);
      expect(v.minor).toBe(45);
      expect(v.patch).toBe(2);
      expect(v.windowsVersion).toBe(1);
    });

    it('falls back safely on unknown or invalid version strings', () => {
      const v = GitCliClient.parseVersion('custom-git-build');
      expect(v.major).toBe(0);
      expect(v.minor).toBe(0);
      expect(v.patch).toBe(0);
      expect(v.raw).toBe('custom-git-build');
    });
  });

  describe('Command execution with FakeProcessRunner', () => {
    it('executes successful command and returns decoded strings and raw buffers', async () => {
      const unicodeText = 'Nhánh tính năng: tiếng Việt có dấu 🚀';
      const fakeRunner = new FakeProcessRunner({
        stdout: Buffer.from(unicodeText, 'utf-8'),
        stderr: Buffer.from('warning: some info\n', 'utf-8'),
        exitCode: 0,
        durationMs: 42,
      });

      const client = new GitCliClient('git', fakeRunner);
      const result = await client.exec(['log', '-1']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(unicodeText);
      expect(result.stderr).toBe('warning: some info\n');
      expect(result.stdoutBuffer).toEqual(Buffer.from(unicodeText, 'utf-8'));
      expect(result.durationMs).toBe(42);
      expect(result.command).toBe('git log -1');
    });

    it('preserves argument array verbatim without splitting on spaces or shell metacharacters', async () => {
      const fakeRunner = new FakeProcessRunner({ exitCode: 0 });
      const client = new GitCliClient('/usr/local/bin/git', fakeRunner);

      const complexArgs = [
        'log',
        '--grep=feat: [ABC-123] support spaces & symbols; echo injected',
        'path with spaces/file name.txt',
        'ref/heads/feature/tiếng-việt',
      ];

      await client.exec(complexArgs);

      expect(fakeRunner.lastOptions?.args).toEqual(complexArgs);
      expect(fakeRunner.lastOptions?.executable).toBe('/usr/local/bin/git');
    });

    it('throws GitCommandError on non-zero exit code with stderr details', async () => {
      const fakeRunner = new FakeProcessRunner({
        stdout: Buffer.from(''),
        stderr: Buffer.from('fatal: Not a valid object name non-existent-branch\n'),
        exitCode: 128,
        durationMs: 25,
      });

      const client = new GitCliClient('git', fakeRunner);

      await expect(client.exec(['rev-parse', 'non-existent-branch'])).rejects.toThrowError(
        GitCommandError,
      );

      try {
        await client.exec(['rev-parse', 'non-existent-branch']);
      } catch (err) {
        expect(err).toBeInstanceOf(GitCommandError);
        const gitErr = err as GitCommandError;
        expect(gitErr.exitCode).toBe(128);
        expect(gitErr.code).toBe(AppErrorCode.GIT_COMMAND_FAILED);
        expect(gitErr.stderr).toContain('fatal: Not a valid object name');
        expect(gitErr.durationMs).toBe(25);
        expect(gitErr.isTimeout).toBe(false);
        expect(gitErr.isCancelled).toBe(false);
      }
    });

    it('throws GitCommandError when process execution times out', async () => {
      const fakeRunner = new FakeProcessRunner({
        timedOut: true,
        exitCode: null,
        signal: 'SIGTERM',
      });

      const client = new GitCliClient('git', fakeRunner);

      await expect(client.exec(['fetch', 'origin'], { timeoutMs: 5000 })).rejects.toThrowError(
        GitCommandError,
      );

      try {
        await client.exec(['fetch', 'origin'], { timeoutMs: 5000 });
      } catch (err) {
        const gitErr = err as GitCommandError;
        expect(gitErr.isTimeout).toBe(true);
        expect(gitErr.code).toBe(AppErrorCode.GIT_COMMAND_FAILED);
        expect(gitErr.message).toContain('timed out');
      }
    });

    it('throws GitCommandError with OPERATION_CANCELLED when cancelled via AbortSignal', async () => {
      const fakeRunner = new FakeProcessRunner({
        cancelled: true,
        exitCode: null,
        signal: 'SIGTERM',
      });

      const client = new GitCliClient('git', fakeRunner);
      const controller = new AbortController();

      try {
        await client.exec(['fetch'], { signal: controller.signal });
        expect.unreachable('Should have thrown GitCommandError');
      } catch (err) {
        const gitErr = err as GitCommandError;
        expect(gitErr.isCancelled).toBe(true);
        expect(gitErr.code).toBe(AppErrorCode.OPERATION_CANCELLED);
      }
    });

    it('cancels immediately if AbortSignal is already aborted before exec', async () => {
      const fakeRunner = new FakeProcessRunner();
      const runSpy = vi.spyOn(fakeRunner, 'run');
      const client = new GitCliClient('git', fakeRunner);

      const controller = new AbortController();
      controller.abort();

      await expect(client.exec(['status'], { signal: controller.signal })).rejects.toThrow(
        GitCommandError,
      );
      expect(runSpy).not.toHaveBeenCalled();
    });

    it('throws GitCommandError when max buffer output is exceeded', async () => {
      const fakeRunner = new FakeProcessRunner({
        maxOutputExceeded: true,
        exitCode: null,
      });

      const client = new GitCliClient('git', fakeRunner);

      try {
        await client.exec(['diff'], { maxBufferBytes: 1024 });
        expect.unreachable('Should have thrown GitCommandError');
      } catch (err) {
        const gitErr = err as GitCommandError;
        expect(gitErr.isMaxOutputExceeded).toBe(true);
        expect(gitErr.code).toBe(AppErrorCode.GIT_COMMAND_FAILED);
      }
    });

    it('maps ENOENT spawn error to GIT_NOT_FOUND error code', async () => {
      const enoentErr = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
      const fakeRunner = new FakeProcessRunner();
      fakeRunner.mockError = enoentErr;

      const client = new GitCliClient('/invalid/path/to/git', fakeRunner);

      try {
        await client.exec(['--version']);
        expect.unreachable('Should have thrown GitCommandError');
      } catch (err) {
        const gitErr = err as GitCommandError;
        expect(gitErr.code).toBe(AppErrorCode.GIT_NOT_FOUND);
        expect(gitErr.message).toContain('Git executable not found');
      }
    });

    it('detect() finds executable using runner probe', async () => {
      const fakeRunner = new FakeProcessRunner({
        stdout: Buffer.from('git version 2.40.1\n'),
        exitCode: 0,
      });

      const detected = await GitCliClient.detect('custom-git', fakeRunner);
      expect(detected.path).toBe('custom-git');
      expect(detected.version.major).toBe(2);
      expect(detected.version.minor).toBe(40);
      expect(detected.version.patch).toBe(1);
    });
  });

  describe('DefaultProcessRunner basic operations', () => {
    const runner = new DefaultProcessRunner();

    it('handles process that completes and captures stdout buffer', async () => {
      const output = await runner.run({
        executable: process.execPath,
        args: ['-e', 'process.stdout.write("hello from node buffer")'],
      });

      expect(output.exitCode).toBe(0);
      expect(output.stdout.toString('utf-8')).toBe('hello from node buffer');
      expect(output.stderr.length).toBe(0);
      expect(output.timedOut).toBe(false);
      expect(output.cancelled).toBe(false);
    });

    it('handles stdin piping and non-zero exit code', async () => {
      const output = await runner.run({
        executable: process.execPath,
        args: [
          '-e',
          'let d = ""; process.stdin.on("data", c => d += c); process.stdin.on("end", () => { process.stderr.write(d); process.exit(42); });',
        ],
        stdin: 'echoed input via stdin',
      });

      expect(output.exitCode).toBe(42);
      expect(output.stderr.toString('utf-8')).toBe('echoed input via stdin');
    });

    it('handles timeout when process exceeds timeoutMs', async () => {
      const output = await runner.run({
        executable: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 10000)'],
        timeoutMs: 80,
      });

      expect(output.timedOut).toBe(true);
    });

    it('handles cancellation via AbortSignal', async () => {
      const controller = new AbortController();
      const runPromise = runner.run({
        executable: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 10000)'],
        signal: controller.signal,
      });

      setTimeout(() => controller.abort(), 50);
      const output = await runPromise;

      expect(output.cancelled).toBe(true);
    });

    it('handles maxBufferBytes limit enforcement', async () => {
      const output = await runner.run({
        executable: process.execPath,
        args: ['-e', 'process.stdout.write("A".repeat(10000)); setTimeout(() => {}, 1000)'],
        maxBufferBytes: 50,
      });

      expect(output.maxOutputExceeded).toBe(true);
    });
  });
});
