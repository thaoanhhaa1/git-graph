import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { GitGraphStatusBar } from '../src/statusbar/GitGraphStatusBar';
import type { RepositoryDescriptor } from '@git-graph/shared';
import type { GitClient, GitResult } from '@git-graph/git-core';
import type { RepositoryManager } from '../src/repositories/RepositoryManager';
import type { RepositoryWatcher } from '../src/watchers/RepositoryWatcher';

describe('GitGraphStatusBar', () => {
  let mockRepoManager: {
    getActiveRepository: ReturnType<typeof vi.fn>;
    onDidChangeActiveRepository: vscode.Event<RepositoryDescriptor | undefined>;
    onDidChangeRepositories: vscode.Event<RepositoryDescriptor[]>;
    dispose: ReturnType<typeof vi.fn>;
  };
  let mockRepoWatcher: {
    onDidRepositoryChange: vscode.Event<void>;
    setWatchedRepositories: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
  let mockClient: GitClient;
  let activeRepoChangeEmitter: vscode.EventEmitter<RepositoryDescriptor | undefined>;
  let reposChangeEmitter: vscode.EventEmitter<RepositoryDescriptor[]>;
  let watcherChangeEmitter: vscode.EventEmitter<void>;

  const repoDesc: RepositoryDescriptor = {
    id: 'repo-1',
    name: 'test-repo',
    rootPath: '/path/to/repo',
    gitDir: '/path/to/repo/.git',
    isBare: false,
    path: '/path/to/repo',
  };

  beforeEach(() => {
    activeRepoChangeEmitter = new vscode.EventEmitter<RepositoryDescriptor | undefined>();
    reposChangeEmitter = new vscode.EventEmitter<RepositoryDescriptor[]>();
    watcherChangeEmitter = new vscode.EventEmitter<void>();

    mockRepoManager = {
      getActiveRepository: vi.fn().mockReturnValue(repoDesc),
      onDidChangeActiveRepository: activeRepoChangeEmitter.event,
      onDidChangeRepositories: reposChangeEmitter.event,
      dispose: vi.fn(),
    };

    mockRepoWatcher = {
      onDidRepositoryChange: watcherChangeEmitter.event,
      setWatchedRepositories: vi.fn(),
      dispose: vi.fn(),
    };

    mockClient = {
      gitPath: 'git',
      getVersion: vi.fn(),
      exec: vi.fn().mockImplementation(async (args: string[]) => {
        if (args.includes('rev-parse')) {
          return { exitCode: 0, stdout: 'abc1234567890\n', stderr: '' } as GitResult;
        }
        if (args.includes('for-each-ref')) {
          // Record format: fullName \x1f objectname \x1f objecttype \x1f peeled \x1f upstream \x1f headMarker \x1f symref \x1e
          const stdout =
            'refs/heads/main\x1f' +
            'abc1234567890\x1f' +
            'commit\x1f' +
            '\x1f' +
            'origin/main\x1f' +
            '*\x1f' +
            '\x1e';
          return { exitCode: 0, stdout, stderr: '' } as GitResult;
        }
        if (args.includes('rev-list')) {
          return { exitCode: 0, stdout: '2\t1\n', stderr: '' } as GitResult;
        }
        return { exitCode: 0, stdout: '', stderr: '' } as GitResult;
      }),
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  function createStatusBar(): GitGraphStatusBar {
    return new GitGraphStatusBar({
      repositoryManager: mockRepoManager as unknown as RepositoryManager,
      repositoryWatcher: mockRepoWatcher as unknown as RepositoryWatcher,
      client: mockClient,
    });
  }

  it('initializes status bar item with correct command, tooltip and initial branch with ahead/behind', async () => {
    const statusBar = createStatusBar();

    await statusBar.update();

    const item = statusBar.statusBarItem;
    expect(item.command).toBe('gitGraph.openGraph');
    expect(item.tooltip).toBe('Open Git Graph (Workspace)');
    expect(item.text).toBe('$(git-branch) main ↑2 ↓1');
    expect((item as unknown as { visible: boolean }).visible).toBe(true);

    statusBar.dispose();
  });

  it('displays branch name without ahead/behind suffix when up-to-date (0 0)', async () => {
    mockClient.exec = vi.fn().mockImplementation(async (args: string[]) => {
      if (args.includes('for-each-ref')) {
        const stdout =
          'refs/heads/feature\x1f' +
          'abc1234567890\x1f' +
          'commit\x1f' +
          '\x1f' +
          'origin/feature\x1f' +
          '*\x1f' +
          '\x1e';
        return { exitCode: 0, stdout, stderr: '' } as GitResult;
      }
      if (args.includes('rev-list')) {
        return { exitCode: 0, stdout: '0\t0\n', stderr: '' } as GitResult;
      }
      return { exitCode: 0, stdout: '', stderr: '' } as GitResult;
    });

    const statusBar = createStatusBar();

    await statusBar.update();

    expect(statusBar.statusBarItem.text).toBe('$(git-branch) feature');
    statusBar.dispose();
  });

  it('displays detached HEAD state when current branch is absent', async () => {
    mockClient.exec = vi.fn().mockImplementation(async (args: string[]) => {
      if (args.includes('rev-parse')) {
        return {
          exitCode: 0,
          stdout: 'fedcba98765432101234567890abcdef12345678\n',
          stderr: '',
        } as GitResult;
      }
      if (args.includes('for-each-ref')) {
        // No current branch ('*')
        const stdout =
          'refs/heads/main\x1f' +
          '11111111111111\x1f' +
          'commit\x1f' +
          '\x1f' +
          'origin/main\x1f' +
          ' \x1f' +
          '\x1e';
        return { exitCode: 0, stdout, stderr: '' } as GitResult;
      }
      return { exitCode: 0, stdout: '', stderr: '' } as GitResult;
    });

    const statusBar = createStatusBar();

    await statusBar.update();

    expect(statusBar.statusBarItem.text).toBe('$(git-branch) (fedcba9)');
    statusBar.dispose();
  });

  it('hides item when no active repository is available', async () => {
    mockRepoManager.getActiveRepository.mockReturnValue(undefined);

    const statusBar = createStatusBar();

    await statusBar.update();

    expect((statusBar.statusBarItem as unknown as { visible: boolean }).visible).toBe(false);
    statusBar.dispose();
  });

  it('schedules update when watcher triggers repository change', async () => {
    vi.useFakeTimers();

    const statusBar = createStatusBar();

    const spyUpdate = vi.spyOn(statusBar, 'update');
    watcherChangeEmitter.fire();

    vi.advanceTimersByTime(150);
    expect(spyUpdate).toHaveBeenCalled();

    statusBar.dispose();
    vi.useRealTimers();
  });
});
