import { create } from 'zustand';
import type { GitWorktreeInfo } from '@git-graph/shared';
import { requestGitWorktreeList } from '../messaging/messageRouter';

export interface GitWorktreeStoreState {
  repositoryId: string | null;
  worktrees: GitWorktreeInfo[];
  currentPath?: string;
  isLoading: boolean;
  error: string | null;
}

export interface GitWorktreeStoreActions {
  requestWorktrees: (repositoryId: string) => void;
  receiveWorktrees: (
    repositoryId: string,
    worktrees: GitWorktreeInfo[],
    currentPath?: string,
  ) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export type GitWorktreeStore = GitWorktreeStoreState & GitWorktreeStoreActions;

export const useGitWorktreeStore = create<GitWorktreeStore>((set, get) => ({
  repositoryId: null,
  worktrees: [],
  currentPath: undefined,
  isLoading: false,
  error: null,

  requestWorktrees: (repositoryId: string) => {
    set({
      repositoryId,
      isLoading: get().repositoryId !== repositoryId || get().worktrees.length === 0,
      error: null,
    });
    requestGitWorktreeList(repositoryId);
  },

  receiveWorktrees: (repositoryId: string, worktrees: GitWorktreeInfo[], currentPath?: string) => {
    set({
      repositoryId,
      worktrees,
      currentPath,
      isLoading: false,
      error: null,
    });
  },

  setError: (error: string | null) => {
    set({ error, isLoading: false });
  },

  reset: () => {
    set({
      repositoryId: null,
      worktrees: [],
      currentPath: undefined,
      isLoading: false,
      error: null,
    });
  },
}));
