import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import {
  RepositoryWatcher,
  isRelevantGitFile,
  type RepositoryChangeEvent,
} from '../src/watchers/RepositoryWatcher';
import { MockFileSystemWatcher, activeWatchers } from './__mocks__/vscode';
import type { RepositoryDescriptor } from '@git-graph/shared';

describe('RepositoryWatcher & isRelevantGitFile', () => {
  describe('isRelevantGitFile', () => {
    it('identifies HEAD and logs/HEAD correctly', () => {
      expect(isRelevantGitFile('HEAD')).toBe(true);
      expect(isRelevantGitFile('/path/to/.git/HEAD')).toBe(true);
      expect(isRelevantGitFile('C:\\repo\\.git\\HEAD')).toBe(true);
      expect(isRelevantGitFile('logs/HEAD')).toBe(true);
      expect(isRelevantGitFile('/path/to/.git/logs/HEAD')).toBe(true);
      expect(isRelevantGitFile('C:\\repo\\.git\\logs\\HEAD')).toBe(true);
    });

    it('identifies refs and packed-refs correctly', () => {
      expect(isRelevantGitFile('refs/heads/main')).toBe(true);
      expect(isRelevantGitFile('/repo/.git/refs/heads/feature-1')).toBe(true);
      expect(isRelevantGitFile('/repo/.git/refs/tags/v1.0.0')).toBe(true);
      expect(isRelevantGitFile('/repo/.git/refs/remotes/origin/main')).toBe(true);
      expect(isRelevantGitFile('packed-refs')).toBe(true);
      expect(isRelevantGitFile('/repo/.git/packed-refs')).toBe(true);
      expect(isRelevantGitFile('C:\\repo\\.git\\packed-refs')).toBe(true);
    });

    it('identifies Git active state files and directories', () => {
      expect(isRelevantGitFile('/repo/.git/MERGE_HEAD')).toBe(true);
      expect(isRelevantGitFile('/repo/.git/REBASE_HEAD')).toBe(true);
      expect(isRelevantGitFile('/repo/.git/CHERRY_PICK_HEAD')).toBe(true);
      expect(isRelevantGitFile('/repo/.git/REVERT_HEAD')).toBe(true);
      expect(isRelevantGitFile('/repo/.git/BISECT_LOG')).toBe(true);
      expect(isRelevantGitFile('/repo/.git/rebase-merge/done')).toBe(true);
      expect(isRelevantGitFile('/repo/.git/rebase-apply/patch')).toBe(true);
    });

    it('ignores unrelated files such as git objects, locks, and config', () => {
      expect(
        isRelevantGitFile('/repo/.git/objects/4b/825dc642cb6eb9a060e54bf8d69288fbee4904'),
      ).toBe(false);
      expect(isRelevantGitFile('/repo/.git/config')).toBe(false);
      expect(isRelevantGitFile('/repo/.git/index.lock')).toBe(false);
      expect(isRelevantGitFile('/repo/src/index.ts')).toBe(false);
      expect(isRelevantGitFile('/repo/README.md')).toBe(false);
    });
  });

  describe('RepositoryWatcher class', () => {
    let watcher: RepositoryWatcher;
    const repo1: RepositoryDescriptor = {
      id: 'repo-1',
      name: 'Project 1',
      rootPath: '/workspaces/proj1',
      gitDir: '/workspaces/proj1/.git',
      isBare: false,
    };
    const repo2: RepositoryDescriptor = {
      id: 'repo-2',
      name: 'Project 2',
      rootPath: '/workspaces/proj2',
      gitDir: '/workspaces/proj2/.git',
      isBare: false,
    };

    beforeEach(() => {
      activeWatchers.length = 0;
      vi.useFakeTimers();
    });

    afterEach(() => {
      watcher?.dispose();
      vi.useRealTimers();
    });

    it('starts watching repository and registers fs event listeners', () => {
      watcher = new RepositoryWatcher({ debounceMs: 50 });
      expect(watcher.isWatching('repo-1')).toBe(false);

      watcher.watchRepository(repo1);
      expect(watcher.isWatching('repo-1')).toBe(true);
      expect(activeWatchers.length).toBe(1);
    });

    it('debounces rapid filesystem events into a single repository change event', () => {
      watcher = new RepositoryWatcher({ debounceMs: 100 });
      watcher.watchRepository(repo1);

      const events: RepositoryChangeEvent[] = [];
      watcher.onDidRepositoryChange((e) => events.push(e));

      const mockWatcher = activeWatchers[0] as MockFileSystemWatcher;
      expect(mockWatcher).toBeDefined();

      // Fire multiple rapid events within debounce window
      mockWatcher.fireChange(vscode.Uri.file('/workspaces/proj1/.git/HEAD'));
      mockWatcher.fireChange(vscode.Uri.file('/workspaces/proj1/.git/refs/heads/main'));
      mockWatcher.fireCreate(vscode.Uri.file('/workspaces/proj1/.git/logs/HEAD'));

      // Before debounce expires, no event should have fired
      vi.advanceTimersByTime(50);
      expect(events.length).toBe(0);

      // Advance past debounce window
      vi.advanceTimersByTime(60);
      expect(events.length).toBe(1);
      expect(events[0]?.repositoryId).toBe('repo-1');
      expect(events[0]?.gitDir).toBe('/workspaces/proj1/.git');
    });

    it('filters out events for irrelevant git files', () => {
      watcher = new RepositoryWatcher({ debounceMs: 50 });
      watcher.watchRepository(repo1);

      const events: RepositoryChangeEvent[] = [];
      watcher.onDidRepositoryChange((e) => events.push(e));

      const mockWatcher = activeWatchers[0] as MockFileSystemWatcher;
      mockWatcher.fireChange(
        vscode.Uri.file('/workspaces/proj1/.git/objects/12/34567890abcdef1234567890abcdef12345678'),
      );
      mockWatcher.fireChange(vscode.Uri.file('/workspaces/proj1/.git/config'));

      vi.advanceTimersByTime(100);
      expect(events.length).toBe(0);
    });

    it('handles independent debounce timers across multiple repositories', () => {
      watcher = new RepositoryWatcher({ debounceMs: 100 });
      watcher.setWatchedRepositories([repo1, repo2]);

      expect(activeWatchers.length).toBe(2);
      const watcher1 = activeWatchers[0] as MockFileSystemWatcher;
      const watcher2 = activeWatchers[1] as MockFileSystemWatcher;

      const events: RepositoryChangeEvent[] = [];
      watcher.onDidRepositoryChange((e) => events.push(e));

      // Trigger repo1
      watcher1.fireChange(vscode.Uri.file('/workspaces/proj1/.git/HEAD'));

      // 40ms later trigger repo2
      vi.advanceTimersByTime(40);
      watcher2.fireChange(vscode.Uri.file('/workspaces/proj2/.git/refs/heads/main'));

      // 70ms later (total 110ms): repo1 should have fired, repo2 has not yet
      vi.advanceTimersByTime(70);
      expect(events.length).toBe(1);
      expect(events[0]?.repositoryId).toBe('repo-1');

      // 40ms later: repo2 fires
      vi.advanceTimersByTime(40);
      expect(events.length).toBe(2);
      expect(events[1]?.repositoryId).toBe('repo-2');
    });

    it('updates watched repositories dynamically with setWatchedRepositories', () => {
      watcher = new RepositoryWatcher({ debounceMs: 50 });
      watcher.setWatchedRepositories([repo1]);
      expect(watcher.isWatching('repo-1')).toBe(true);
      expect(watcher.isWatching('repo-2')).toBe(false);

      // Now switch to repo2
      watcher.setWatchedRepositories([repo2]);
      expect(watcher.isWatching('repo-1')).toBe(false);
      expect(watcher.isWatching('repo-2')).toBe(true);
    });

    it('cancels pending debounce timers on unwatchRepository and dispose', () => {
      watcher = new RepositoryWatcher({ debounceMs: 100 });
      watcher.watchRepository(repo1);

      const events: RepositoryChangeEvent[] = [];
      watcher.onDidRepositoryChange((e) => events.push(e));

      const mockWatcher = activeWatchers[0] as MockFileSystemWatcher;
      mockWatcher.fireChange(vscode.Uri.file('/workspaces/proj1/.git/HEAD'));

      // Unwatch before timer fires
      watcher.unwatchRepository('repo-1');

      vi.advanceTimersByTime(200);
      expect(events.length).toBe(0);
    });
  });
});
