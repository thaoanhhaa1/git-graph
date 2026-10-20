import React, { useMemo, useEffect, useState, useCallback } from 'react';
import type { GitRef, OperationResetMode, SearchType } from '@git-graph/shared';
import { Toolbar } from '../toolbar/Toolbar';
import { ActiveFiltersBar } from '../search/ActiveFiltersBar';
import { EmptyState } from '../common/EmptyState';
import { ErrorState } from '../common/ErrorState';
import { CommitList, COMPACT_ROW_HEIGHT, DEFAULT_ROW_HEIGHT } from './CommitList';
import type { CommitItem } from './CommitRow';
import type { RefBadgeItem } from '../refs/RefBadge';
import { CommitContextMenu, copyToClipboard } from '../menu/CommitContextMenu';
import { CompareBranchDialog, findCommitShaForBranch } from '../dialogs/CompareBranchDialog';
import { RenameBranchDialog } from '../dialogs/RenameBranchDialog';
import { DeleteBranchDialog } from '../dialogs/DeleteBranchDialog';
import { CreateBranchDialog } from '../dialogs/CreateBranchDialog';
import { CreateTagDialog } from '../dialogs/CreateTagDialog';
import { DeleteTagDialog } from '../dialogs/DeleteTagDialog';
import { MergeDialog } from '../dialogs/MergeDialog';
import { RebaseDialog } from '../dialogs/RebaseDialog';
import { ResetDialog } from '../dialogs/ResetDialog';
import { CherryPickDialog } from '../dialogs/CherryPickDialog';
import { RevertDialog } from '../dialogs/RevertDialog';
import { StashSaveDialog } from '../dialogs/StashSaveDialog';
import { StashManagerDialog } from '../dialogs/StashManagerDialog';
import { useRepositoryStore } from '../../stores/repositoryStore';
import { useGraphStore } from '../../stores/graphStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useDetailsStore, buildDetailsCacheKey } from '../../stores/detailsStore';
import { useDiffStore } from '../../stores/diffStore';
import { useConfigStore } from '../../stores/configStore';
import { useCommitRows, type NormalizedCommit } from '../../hooks/useCommitRows';
import { formatGitGraphDate } from '../common/dateUtils';
import { useToast } from '../../hooks/useToast';
import { Toast } from '../../components/ui/Toast';
import type { OperationMergeFastForwardMode, TagType } from '@git-graph/shared';
import {
  requestRepositoriesList,
  requestGraphRefresh,
  requestNextCommitsPage,
  requestCheckout,
  requestCreateBranch,
  requestRenameBranch,
  requestDeleteBranch,
  requestPushBranch,
  requestCreateTag,
  requestDeleteTag,
  requestAbortMerge,
  requestMerge,
  requestRebase,
  requestRebaseAction,
  requestCherryPick,
  requestCherryPickAction,
  requestRevert,
  requestReset,
  requestFetch,
  requestSaveStash,
  requestStashList,
  requestPopStash,
  requestApplyStash,
  requestDropStash,
} from '../../messaging/messageRouter';
import { useWorktreeStore } from '../../stores/worktreeStore';

export type { NormalizedCommit };

function matchesRef(commit: NormalizedCommit, query: string): boolean {
  for (const ref of commit.refsLower) {
    if (
      (ref.type === 'head' ||
        ref.type === 'localBranch' ||
        ref.type === 'remoteBranch' ||
        ref.type === 'tag') &&
      ref.nameLower.includes(query)
    ) {
      return true;
    }
  }
  return false;
}

function matchesCommit(commit: NormalizedCommit, query: string, searchType: SearchType): boolean {
  if (!query) return false;

  switch (searchType) {
    case 'subject':
      return commit.subjectLower.includes(query);
    case 'author':
      return commit.authorLower.includes(query);
    case 'hash':
      return commit.hashLower.includes(query) || commit.shortHashLower.includes(query);
    case 'ref':
      return matchesRef(commit, query);
    case 'all':
    default:
      return (
        commit.subjectLower.includes(query) ||
        commit.authorLower.includes(query) ||
        commit.hashLower.includes(query) ||
        commit.shortHashLower.includes(query) ||
        matchesRef(commit, query)
      );
  }
}

export interface GitGraphViewProps {
  searchDebounceMs?: number;
}

export const GitGraphView: React.FC<GitGraphViewProps> = ({ searchDebounceMs = 250 }) => {
  const repositories = useRepositoryStore((s) => s.repositories);
  const hasBootstrapped = useRepositoryStore((s) => s.hasBootstrapped);
  const repoError = useRepositoryStore((s) => s.error);
  const activeRepo = useRepositoryStore((s) => s.getActiveRepository());
  const repositoryRemotes = useMemo(() => {
    if (!activeRepo || !('remotes' in activeRepo)) {
      return [];
    }
    return activeRepo.remotes ?? [];
  }, [activeRepo]);

  const rawCommits = useGraphStore((s) => s.commits);
  const searchTerm = useGraphStore((s) => s.searchTerm);
  const searchType = useGraphStore((s) => s.searchType);
  const selectedBranch = useGraphStore((s) => s.selectedBranch);
  const graphError = useGraphStore((s) => s.error);
  const hasMore = useGraphStore((s) => s.hasMore);
  const isLoadingMore = useGraphStore((s) => s.isLoadingMore);

  const selectedCommitSha = useSelectionStore((s) => s.selectedCommitSha);
  const secondarySelectedCommitSha = useSelectionStore((s) => s.secondarySelectedCommitSha);
  const selectCommit = useSelectionStore((s) => s.selectCommit);
  const selectSecondaryCommit = useSelectionStore((s) => s.selectSecondaryCommit);
  const isDetailPanelOpen = useSelectionStore((s) => s.isDetailPanelOpen);
  const setDetailPanelOpen = useSelectionStore((s) => s.setDetailPanelOpen);
  const contextMenu = useSelectionStore((s) => s.contextMenu);
  const openContextMenu = useSelectionStore((s) => s.openContextMenu);
  const closeContextMenu = useSelectionStore((s) => s.closeContextMenu);

  const compactMode = useConfigStore((s) => s.config.compactMode);
  const rowHeight = compactMode ? COMPACT_ROW_HEIGHT : DEFAULT_ROW_HEIGHT;

  const [focusChangesOnOpen, setFocusChangesOnOpen] = useState(false);
  const { toast, showToast } = useToast();
  const hasLiveCommits = rawCommits.length > 0;
  const [compareBranchDialog, setCompareBranchDialog] = useState<{
    isOpen: boolean;
    sourceBranch: string;
    sourceSha?: string;
  }>({
    isOpen: false,
    sourceBranch: '',
  });
  const [renameBranchDialog, setRenameBranchDialog] = useState<{
    isOpen: boolean;
    branchName: string;
  }>({
    isOpen: false,
    branchName: '',
  });
  const [deleteBranchDialog, setDeleteBranchDialog] = useState<{
    isOpen: boolean;
    branchName: string;
  }>({
    isOpen: false,
    branchName: '',
  });
  const [createBranchDialog, setCreateBranchDialog] = useState<{
    isOpen: boolean;
    commitSha: string;
  }>({
    isOpen: false,
    commitSha: '',
  });
  const [createTagDialog, setCreateTagDialog] = useState<{
    isOpen: boolean;
    commitSha: string;
    commitSubject?: string;
  }>({
    isOpen: false,
    commitSha: '',
  });
  const [deleteTagDialog, setDeleteTagDialog] = useState<{
    isOpen: boolean;
    tagName: string;
  }>({
    isOpen: false,
    tagName: '',
  });
  const [mergeDialog, setMergeDialog] = useState<{
    isOpen: boolean;
    target: string;
  }>({
    isOpen: false,
    target: '',
  });
  const [rebaseDialog, setRebaseDialog] = useState<{
    isOpen: boolean;
    target: string;
    isPublished: boolean;
    upstream?: string;
  }>({
    isOpen: false,
    target: '',
    isPublished: false,
  });
  const [resetDialog, setResetDialog] = useState<{
    isOpen: boolean;
    target: string;
    targetSubject?: string;
    targetAuthor?: string;
    targetDate?: string;
    initialMode: OperationResetMode;
  }>({
    isOpen: false,
    target: '',
    initialMode: 'mixed',
  });
  const [cherryPickDialog, setCherryPickDialog] = useState<{
    isOpen: boolean;
    commitSha: string;
    commitSubject?: string;
    parents: string[];
    parentSubjects?: Record<string, string>;
  }>({
    isOpen: false,
    commitSha: '',
    parents: [],
  });
  const [revertDialog, setRevertDialog] = useState<{
    isOpen: boolean;
    commitSha: string;
    commitSubject?: string;
    parents: string[];
    parentSubjects?: Record<string, string>;
  }>({
    isOpen: false,
    commitSha: '',
    parents: [],
  });
  const [stashSaveDialogOpen, setStashSaveDialogOpen] = useState(false);
  const [stashManagerOpen, setStashManagerOpen] = useState(false);
  const stashes = useWorktreeStore((s) => s.stashes);
  const isLoadingStashes = useWorktreeStore((s) => s.isLoadingStashes);

  const errorMessage = repoError || graphError;
  const isMergeConflictError = Boolean(
    errorMessage &&
    (errorMessage.includes('Merge stopped with conflicts') ||
      errorMessage.includes('git merge') ||
      errorMessage.includes('Automatic merge failed')),
  );
  const isRebaseConflictError = Boolean(
    errorMessage && errorMessage.includes('Rebase stopped with conflicts'),
  );
  const isCherryPickConflictError = Boolean(
    errorMessage && errorMessage.includes('Cherry-pick stopped with conflicts'),
  );

  const handleScanRepositories = useCallback(() => {
    requestRepositoriesList(true);
  }, []);

  const handleRetry = useCallback(() => {
    useGraphStore.getState().setError(null);
    useRepositoryStore.getState().setError(null);
    if (repositories.length === 0) {
      requestRepositoriesList(true);
    } else {
      requestGraphRefresh(false);
    }
  }, [repositories.length]);

  const handleDismissError = useCallback(() => {
    useGraphStore.getState().setError(null);
    useRepositoryStore.getState().setError(null);
  }, []);

  const handleFetch = useCallback(() => {
    useGraphStore.getState().setError(null);
    useRepositoryStore.getState().setError(null);
    requestFetch();
    showToast('Fetching commits from remote...');
  }, [showToast]);

  const handleAbortMerge = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    requestAbortMerge({ repositoryId: activeRepo.id });
  }, [activeRepo]);

  const handleContinueRebase = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    requestRebaseAction('continue', { repositoryId: activeRepo.id });
  }, [activeRepo]);

  const handleAbortRebase = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    requestRebaseAction('abort', { repositoryId: activeRepo.id });
  }, [activeRepo]);

  const handleSkipRebase = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    requestRebaseAction('skip', { repositoryId: activeRepo.id });
  }, [activeRepo]);

  const handleContinueCherryPick = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    requestCherryPickAction('continue', { repositoryId: activeRepo.id });
  }, [activeRepo]);

  const handleAbortCherryPick = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    requestCherryPickAction('abort', { repositoryId: activeRepo.id });
  }, [activeRepo]);

  const handleSkipCherryPick = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    requestCherryPickAction('skip', { repositoryId: activeRepo.id });
  }, [activeRepo]);

  const handleSelectCommit = useCallback(
    (sha: string, e?: React.MouseEvent | React.KeyboardEvent) => {
      const isCtrlOrCmd = Boolean(e && (e.ctrlKey || e.metaKey));

      if (isCtrlOrCmd) {
        if (!selectedCommitSha) {
          selectCommit(sha);
          selectSecondaryCommit(null);
          setFocusChangesOnOpen(false);
          setDetailPanelOpen(true);
          return;
        }

        const isPrimary =
          selectedCommitSha === sha ||
          selectedCommitSha.startsWith(sha) ||
          sha.startsWith(selectedCommitSha);

        if (isPrimary) {
          if (secondarySelectedCommitSha) {
            selectSecondaryCommit(null);
          }
          return;
        }

        const isSecondary =
          secondarySelectedCommitSha === sha ||
          (secondarySelectedCommitSha !== null &&
            (secondarySelectedCommitSha.startsWith(sha) ||
              sha.startsWith(secondarySelectedCommitSha)));

        if (isSecondary) {
          selectSecondaryCommit(null);
          return;
        }

        selectSecondaryCommit(sha);
        setFocusChangesOnOpen(false);
        setDetailPanelOpen(true);
      } else {
        const isCurrentlySelected =
          selectedCommitSha === sha ||
          (selectedCommitSha !== null &&
            (selectedCommitSha.startsWith(sha) || sha.startsWith(selectedCommitSha)));

        if (isDetailPanelOpen && isCurrentlySelected && !secondarySelectedCommitSha) {
          setDetailPanelOpen(false);
          setFocusChangesOnOpen(false);
          selectSecondaryCommit(null);
        } else {
          selectCommit(sha);
          selectSecondaryCommit(null);
          setFocusChangesOnOpen(false);
          setDetailPanelOpen(true);
        }
      }
    },
    [
      selectedCommitSha,
      secondarySelectedCommitSha,
      isDetailPanelOpen,
      setDetailPanelOpen,
      selectCommit,
      selectSecondaryCommit,
    ],
  );

  const handleOpenDetail = useCallback(
    (sha: string) => {
      selectCommit(sha);
      selectSecondaryCommit(null);
      setFocusChangesOnOpen(false);
      setDetailPanelOpen(true);
    },
    [selectCommit, selectSecondaryCommit, setDetailPanelOpen],
  );

  const handleCloseDetail = useCallback(() => {
    setDetailPanelOpen(false);
    setFocusChangesOnOpen(false);
    selectSecondaryCommit(null);
  }, [setDetailPanelOpen, selectSecondaryCommit]);

  // Global keyboard shortcuts (M13.3)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      if (e.key === 'Escape') {
        const hasOpenModal = document.querySelector('.modal-overlay');
        if (!hasOpenModal && isDetailPanelOpen) {
          e.preventDefault();
          handleCloseDetail();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isDetailPanelOpen, handleCloseDetail]);

  const handleViewChanges = useCallback(
    (sha: string) => {
      selectCommit(sha);
      selectSecondaryCommit(null);
      setFocusChangesOnOpen(true);
      setDetailPanelOpen(true);
      const activeRepoId = activeRepo ? activeRepo.id : undefined;
      if (activeRepoId) {
        const cacheKey = buildDetailsCacheKey(activeRepoId, sha);
        const cached = useDetailsStore.getState().cache.get(cacheKey);
        if (cached?.fileChanges && cached.fileChanges.length > 0 && cached.fileChanges[0]) {
          useDiffStore.getState().selectFile(cached.fileChanges[0]);
        }
      }
    },
    [activeRepo, selectCommit, selectSecondaryCommit, setDetailPanelOpen],
  );

  const handleCompareWithParent = useCallback(
    (sha: string, parentSha?: string) => {
      selectCommit(sha);
      if (parentSha) {
        selectSecondaryCommit(parentSha);
        useDetailsStore.getState().selectParent(parentSha);
      }
      setFocusChangesOnOpen(true);
      setDetailPanelOpen(true);
      if (activeRepo && parentSha) {
        useDetailsStore.getState().requestDetails(activeRepo.id, sha, parentSha);
      }
    },
    [activeRepo, selectCommit, selectSecondaryCommit, setDetailPanelOpen],
  );

  const handleCopySha = useCallback(
    async (sha: string) => {
      await copyToClipboard(sha);
      showToast(`Copied SHA: ${sha.slice(0, 7)}`);
    },
    [showToast],
  );

  const handleCopyMessage = useCallback(
    async (msg: string) => {
      await copyToClipboard(msg);
      showToast('Copied commit message');
    },
    [showToast],
  );

  const handleCheckout = useCallback(
    (
      target: string,
      targetType: 'localBranch' | 'remoteBranch' | 'tag' | 'commit',
      noConfirm?: boolean,
    ) => {
      if (!activeRepo) {
        return;
      }
      requestCheckout({
        repositoryId: activeRepo.id,
        target,
        targetType,
        noConfirm,
      });
    },
    [activeRepo],
  );

  const handleCheckoutRef = useCallback(
    (ref: RefBadgeItem) => {
      let targetType: 'localBranch' | 'remoteBranch' | 'tag' | 'commit' = 'localBranch';
      if (ref.type === 'remoteBranch') {
        targetType = 'remoteBranch';
      } else if (ref.type === 'tag') {
        targetType = 'tag';
      } else if (ref.type === 'head') {
        targetType = 'commit';
      }

      if (ref.type === 'remoteBranch') {
        showToast(`Syncing branch '${ref.name}'...`, 'loading', 3000);
      } else {
        showToast(`Checking out '${ref.name}'...`, 'loading', 2500);
      }

      handleCheckout(ref.fullName || ref.name, targetType, true);
    },
    [handleCheckout, showToast],
  );

  const handleCreateBranch = useCallback((startPoint: string) => {
    setCreateBranchDialog({
      isOpen: true,
      commitSha: startPoint,
    });
  }, []);

  const handleExecuteCreateBranch = useCallback(
    (name: string, commitSha: string, checkout: boolean) => {
      if (!activeRepo) {
        return;
      }
      requestCreateBranch({
        repositoryId: activeRepo.id,
        name,
        startPoint: commitSha,
        checkout,
      });
      showToast(`Creating branch '${name}'...`, 'loading', 3500);
    },
    [activeRepo, showToast],
  );

  const handleCreateTag = useCallback(
    (target: string) => {
      const commit = rawCommits.find((candidate) => candidate.sha === target);
      setCreateTagDialog({
        isOpen: true,
        commitSha: target,
        commitSubject: commit?.subject,
      });
    },
    [rawCommits],
  );

  const handleExecuteCreateTag = useCallback(
    (
      name: string,
      tagType: TagType,
      message: string | undefined,
      pushToRemote: boolean,
      remote?: string,
    ) => {
      if (!activeRepo) {
        return;
      }
      requestCreateTag({
        repositoryId: activeRepo.id,
        name,
        target: createTagDialog.commitSha,
        tagType,
        ...(message ? { message } : {}),
        ...(pushToRemote ? { pushToRemote: true } : {}),
        ...(remote ? { remote } : {}),
      });
      showToast(
        pushToRemote
          ? `Creating tag '${name}' and pushing to remote...`
          : `Creating tag '${name}'...`,
        'loading',
        3500,
      );
    },
    [activeRepo, createTagDialog.commitSha, showToast],
  );

  const handleDeleteTag = useCallback((tagName: string) => {
    setDeleteTagDialog({
      isOpen: true,
      tagName,
    });
  }, []);

  const handleExecuteDeleteTag = useCallback(
    (tagName: string, deleteOnRemote: boolean, remote?: string) => {
      if (!activeRepo) {
        return;
      }
      requestDeleteTag({
        repositoryId: activeRepo.id,
        tagName,
        ...(deleteOnRemote ? { deleteOnRemote: true } : {}),
        ...(remote ? { remote } : {}),
      });
      showToast(
        deleteOnRemote
          ? `Deleting tag '${tagName}' and removing it from remote...`
          : `Deleting tag '${tagName}'...`,
        'loading',
        3500,
      );
    },
    [activeRepo, showToast],
  );

  const handleMerge = useCallback(
    (target: string, squash = false, options?: { exclusive?: boolean; targetBranch?: string }) => {
      if (!activeRepo) {
        return;
      }
      if (squash) {
        requestMerge({
          repositoryId: activeRepo.id,
          target,
          squash: true,
          ...(options?.exclusive !== undefined ? { exclusive: options.exclusive } : {}),
          ...(options?.targetBranch ? { targetBranch: options.targetBranch } : {}),
        });
        return;
      }
      setMergeDialog({
        isOpen: true,
        target,
      });
    },
    [activeRepo],
  );

  const handleExecuteMerge = useCallback(
    (
      target: string,
      fastForwardMode: OperationMergeFastForwardMode,
      squash: boolean,
      noCommit: boolean,
    ) => {
      if (!activeRepo) {
        return;
      }
      requestMerge({
        repositoryId: activeRepo.id,
        target,
        fastForwardMode,
        ...(squash ? { squash: true } : {}),
        ...(noCommit ? { noCommit: true } : {}),
        noConfirm: true,
      });
      showToast(`Merging '${target}' into current branch...`, 'loading', 3500);
    },
    [activeRepo, showToast],
  );

  const handleRebase = useCallback(
    (target: string) => {
      if (!activeRepo) {
        return;
      }
      const currentBranch = activeRepo.currentBranch;
      const branchRef = currentBranch
        ? rawCommits
            .flatMap((commit) => commit.refs)
            .find(
              (ref) =>
                ref.kind === 'localBranch' &&
                (ref.name === currentBranch || ref.fullName === `refs/heads/${currentBranch}`),
            )
        : undefined;
      setRebaseDialog({
        isOpen: true,
        target,
        isPublished: Boolean(branchRef?.upstream),
        upstream: branchRef?.upstream,
      });
    },
    [activeRepo, rawCommits],
  );

  const handleExecuteRebase = useCallback(
    (target: string, ignoreDate: boolean, confirmedPublishedBranch: boolean) => {
      if (!activeRepo) {
        return;
      }
      requestRebase({
        repositoryId: activeRepo.id,
        target,
        ...(ignoreDate ? { ignoreDate: true } : {}),
        ...(confirmedPublishedBranch ? { confirmedPublishedBranch: true } : {}),
        noConfirm: true,
      });
      showToast(`Rebasing current branch onto '${target}'...`, 'loading', 3500);
    },
    [activeRepo, showToast],
  );

  const handleCherryPick = useCallback(
    (commit: string) => {
      const target = rawCommits.find((candidate) => candidate.sha === commit);
      const parents = target?.parents ?? [];
      const parentSubjects: Record<string, string> = {};
      if (parents.length >= 2) {
        for (const parentSha of parents) {
          const parent = rawCommits.find((candidate) => candidate.sha === parentSha);
          if (parent) {
            parentSubjects[parentSha] = parent.subject;
          }
        }
      }
      setCherryPickDialog({
        isOpen: true,
        commitSha: commit,
        commitSubject: target?.subject,
        parents,
        ...(parents.length >= 2 ? { parentSubjects } : {}),
      });
    },
    [rawCommits],
  );

  const handleExecuteCherryPick = useCallback(
    (mainlineParent: number | undefined, noCommit: boolean) => {
      if (!activeRepo) {
        return;
      }
      requestCherryPick({
        repositoryId: activeRepo.id,
        commit: cherryPickDialog.commitSha,
        ...(mainlineParent ? { mainlineParent } : {}),
        ...(noCommit ? { noCommit: true } : {}),
        noConfirm: true,
      });
      showToast(`Cherry-picking ${cherryPickDialog.commitSha.slice(0, 7)}...`, 'loading', 3500);
    },
    [activeRepo, cherryPickDialog.commitSha, showToast],
  );

  const handleRevert = useCallback(
    (sha: string) => {
      const target = rawCommits.find((candidate) => candidate.sha === sha);
      const parents = target?.parents ?? [];
      const parentSubjects: Record<string, string> = {};
      if (parents.length >= 2) {
        for (const parentSha of parents) {
          const parent = rawCommits.find((candidate) => candidate.sha === parentSha);
          if (parent) {
            parentSubjects[parentSha] = parent.subject;
          }
        }
      }
      setRevertDialog({
        isOpen: true,
        commitSha: sha,
        commitSubject: target?.subject,
        parents,
        ...(parents.length >= 2 ? { parentSubjects } : {}),
      });
    },
    [rawCommits],
  );

  const handleExecuteRevert = useCallback(
    (mainlineParent: number | undefined) => {
      if (!activeRepo) {
        return;
      }
      requestRevert({
        repositoryId: activeRepo.id,
        commit: revertDialog.commitSha,
        ...(mainlineParent ? { mainlineParent } : {}),
        noConfirm: true,
      });
      showToast(`Reverting ${revertDialog.commitSha.slice(0, 7)}...`, 'loading', 3500);
    },
    [activeRepo, revertDialog.commitSha, showToast],
  );

  const handleReset = useCallback(
    (target: string, mode: OperationResetMode) => {
      const commit = rawCommits.find((candidate) => candidate.sha === target);
      setResetDialog({
        isOpen: true,
        target,
        targetSubject: commit?.subject,
        targetAuthor: commit?.author.name,
        ...(commit?.author.timestamp
          ? { targetDate: formatGitGraphDate(commit.author.timestamp) }
          : {}),
        initialMode: mode,
      });
    },
    [rawCommits],
  );

  const handleOpenStashSaveDialog = useCallback(() => {
    setStashSaveDialogOpen(true);
  }, []);

  const handleSaveStash = useCallback(
    (options: { message?: string; includeUntracked: boolean; keepIndex: boolean }) => {
      if (!activeRepo) {
        return;
      }
      requestSaveStash({
        repositoryId: activeRepo.id,
        ...(options.message ? { message: options.message } : {}),
        includeUntracked: options.includeUntracked,
        keepIndex: options.keepIndex,
      });
      showToast('Saving stash...', 'loading', 3000);
    },
    [activeRepo, showToast],
  );

  const handleOpenStashManager = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    requestStashList(activeRepo.id);
    setStashManagerOpen(true);
  }, [activeRepo]);

  const handleApplyStash = useCallback(
    (entry: { index: number }) => {
      if (!activeRepo) {
        return;
      }
      requestApplyStash(entry.index, activeRepo.id);
      showToast(`Applying stash@{${entry.index}}...`, 'loading', 3000);
    },
    [activeRepo, showToast],
  );

  const handlePopStash = useCallback(
    (entry: { index: number }) => {
      if (!activeRepo) {
        return;
      }
      requestPopStash(entry.index, activeRepo.id);
      showToast(`Popping stash@{${entry.index}}...`, 'loading', 3000);
    },
    [activeRepo, showToast],
  );

  const handleDropStash = useCallback(
    (entry: { index: number }) => {
      if (!activeRepo) {
        return;
      }
      requestDropStash(entry.index, activeRepo.id);
      showToast(`Dropping stash@{${entry.index}}...`, 'loading', 3000);
    },
    [activeRepo, showToast],
  );
  const handleExecuteReset = useCallback(
    (target: string, mode: OperationResetMode, confirmedHardReset: boolean) => {
      if (!activeRepo) {
        return;
      }
      requestReset({
        repositoryId: activeRepo.id,
        target,
        mode,
        ...(mode === 'hard' && confirmedHardReset ? { confirmedHardReset: true } : {}),
      });
      showToast(`Resetting (${mode}) to ${target.slice(0, 7)}...`, 'loading', 3500);
    },
    [activeRepo, showToast],
  );

  const handleRenameBranch = useCallback((branchName: string) => {
    setRenameBranchDialog({
      isOpen: true,
      branchName,
    });
  }, []);

  const handleExecuteRenameBranch = useCallback(
    (oldName: string, newName: string, syncRemote?: boolean) => {
      if (!activeRepo) return;
      if (oldName === newName && !syncRemote) return;
      requestRenameBranch({
        repositoryId: activeRepo.id,
        oldName,
        newName,
        syncRemote,
      });
      showToast(
        syncRemote
          ? `Renaming branch '${oldName}' to '${newName}' and syncing with remote...`
          : `Renaming branch '${oldName}' to '${newName}'...`,
        'loading',
        4000,
      );
    },
    [activeRepo, showToast],
  );

  const handleDeleteBranch = useCallback((branchName: string) => {
    setDeleteBranchDialog({
      isOpen: true,
      branchName,
    });
  }, []);

  const handleExecuteDeleteBranch = useCallback(
    (branchName: string, forceDelete: boolean, deleteOnRemote: boolean) => {
      if (!activeRepo) return;
      requestDeleteBranch({
        repositoryId: activeRepo.id,
        branchName,
        forceDelete,
        deleteOnRemote,
      });
      showToast(
        deleteOnRemote
          ? `Deleting branch '${branchName}' and removing from remote...`
          : `Deleting branch '${branchName}'...`,
        'loading',
        4000,
      );
    },
    [activeRepo, showToast],
  );

  const handlePushBranch = useCallback(
    (branchName: string) => {
      if (!activeRepo) return;
      const cleanName = branchName.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\//, '');
      requestPushBranch({
        repositoryId: activeRepo.id,
        branchName: cleanName,
        setUpstream: true,
      });
      showToast(`Pushing branch '${cleanName}' to remote...`);
    },
    [activeRepo, showToast],
  );

  const handlePullBranch = useCallback(
    (branchName: string) => {
      showToast(`Pull branch '${branchName}'`);
    },
    [showToast],
  );

  const handleCreateArchive = useCallback(
    (target: string) => {
      showToast(`Create archive for '${target}'`);
    },
    [showToast],
  );

  const handleToggleSelectBranch = useCallback(
    (branchName: string) => {
      showToast(`Toggled branch filter for '${branchName}'`);
    },
    [showToast],
  );

  const handlePinBranch = useCallback(
    (branchName: string) => {
      showToast(`Pinned branch '${branchName}'`);
    },
    [showToast],
  );

  const handleFixup = useCallback(
    (sha: string) => {
      showToast(`Create fixup commit for ${sha.slice(0, 7)}`);
    },
    [showToast],
  );

  const handleSquashCommit = useCallback(
    (sha: string) => {
      showToast(`Create squash commit for ${sha.slice(0, 7)}`);
    },
    [showToast],
  );

  const handleEditMessage = useCallback(
    (sha: string) => {
      showToast(`Edit message for ${sha.slice(0, 7)}`);
    },
    [showToast],
  );

  const handleDropCommit = useCallback(
    (sha: string) => {
      showToast(`Drop commit ${sha.slice(0, 7)}`);
    },
    [showToast],
  );

  const handlePinCommit = useCallback(
    (sha: string) => {
      showToast(`Pinned commit ${sha.slice(0, 7)}`);
    },
    [showToast],
  );

  const handleOpenCompareBranchDialog = useCallback(
    (branchName: string) => {
      const sha = findCommitShaForBranch(branchName, rawCommits);
      setCompareBranchDialog({
        isOpen: true,
        sourceBranch: branchName,
        sourceSha: sha,
      });
    },
    [rawCommits],
  );

  const handleExecuteCompareBranch = useCallback(
    (sourceBranch: string, targetBranch: string, targetSha?: string) => {
      const sourceSha =
        compareBranchDialog.sourceSha || findCommitShaForBranch(sourceBranch, rawCommits);
      const resolvedTargetSha = targetSha || findCommitShaForBranch(targetBranch, rawCommits);

      if (sourceSha && resolvedTargetSha) {
        handleCompareWithParent(sourceSha, resolvedTargetSha);
        showToast(`Comparing branch '${sourceBranch}' with '${targetBranch}'`);
      } else if (sourceSha) {
        handleCompareWithParent(sourceSha);
        showToast(`Comparing branch '${sourceBranch}' with '${targetBranch}'`);
      } else {
        showToast(`Comparing branch '${sourceBranch}' with '${targetBranch}'`);
      }
    },
    [compareBranchDialog.sourceSha, rawCommits, handleCompareWithParent, showToast],
  );

  const handleContextMenu = useCallback(
    (commit: CommitItem, e: React.MouseEvent | React.KeyboardEvent, targetRef?: RefBadgeItem) => {
      let x = 100;
      let y = 100;
      if ('clientX' in e && typeof e.clientX === 'number') {
        x = e.clientX;
        y = e.clientY;
      } else if (e.currentTarget && 'getBoundingClientRect' in e.currentTarget) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        x = rect.left + 50;
        y = rect.top + rect.height / 2;
      }
      const fullRefs = rawCommits.find((candidate) => candidate.sha === commit.hash)?.refs;
      let matchedTargetRef: GitRef | undefined;
      if (targetRef) {
        matchedTargetRef = fullRefs?.find(
          (r) => r.name === targetRef.name || r.fullName === targetRef.fullName,
        ) ?? {
          name: targetRef.name,
          fullName: targetRef.fullName || targetRef.name,
          target: commit.hash,
          kind:
            targetRef.type === 'remoteBranch'
              ? 'remoteBranch'
              : targetRef.type === 'tag'
                ? 'tag'
                : targetRef.type === 'head'
                  ? 'head'
                  : 'localBranch',
          isCurrent: Boolean(targetRef.isCurrent),
        };
      }

      openContextMenu({
        x,
        y,
        commitSha: commit.hash,
        commitMessage: commit.message,
        parents: commit.parents,
        body: commit.body,
        refs: fullRefs,
        targetRef: matchedTargetRef,
      });
    },
    [rawCommits, openContextMenu],
  );

  const handleLoadMore = useCallback(() => requestNextCommitsPage(), []);

  const handleResetLastCommit = useCallback(
    (sha: string) => handleReset(sha, 'soft'),
    [handleReset],
  );

  const closeCompareBranchDialog = useCallback(
    () => setCompareBranchDialog((prev) => ({ ...prev, isOpen: false })),
    [],
  );
  const closeRenameBranchDialog = useCallback(
    () => setRenameBranchDialog((prev) => ({ ...prev, isOpen: false })),
    [],
  );
  const closeDeleteBranchDialog = useCallback(
    () => setDeleteBranchDialog((prev) => ({ ...prev, isOpen: false })),
    [],
  );
  const closeCreateBranchDialog = useCallback(
    () => setCreateBranchDialog((prev) => ({ ...prev, isOpen: false })),
    [],
  );
  const closeCreateTagDialog = useCallback(
    () => setCreateTagDialog((prev) => ({ ...prev, isOpen: false })),
    [],
  );
  const closeDeleteTagDialog = useCallback(
    () => setDeleteTagDialog((prev) => ({ ...prev, isOpen: false })),
    [],
  );
  const closeMergeDialog = useCallback(
    () => setMergeDialog((prev) => ({ ...prev, isOpen: false })),
    [],
  );
  const closeRebaseDialog = useCallback(
    () => setRebaseDialog((prev) => ({ ...prev, isOpen: false })),
    [],
  );
  const closeResetDialog = useCallback(
    () => setResetDialog((prev) => ({ ...prev, isOpen: false })),
    [],
  );
  const closeCherryPickDialog = useCallback(
    () => setCherryPickDialog((prev) => ({ ...prev, isOpen: false })),
    [],
  );
  const closeRevertDialog = useCallback(
    () => setRevertDialog((prev) => ({ ...prev, isOpen: false })),
    [],
  );

  // Live commits from graph store, normalized incrementally with lazily formatted dates
  const displayCommits: NormalizedCommit[] = useCommitRows(rawCommits, activeRepo?.currentBranch);

  // Compute matching commits for local search
  const matchingCommits = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return displayCommits;
    const query = term.toLowerCase();
    return displayCommits.filter((c) => matchesCommit(c, query, searchType));
  }, [displayCommits, searchTerm, searchType]);

  const matchingShas = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return matchingCommits.map((c) => c.hash);
  }, [matchingCommits, searchTerm]);

  // Sync matching SHAs with graphStore
  useEffect(() => {
    useGraphStore.getState().setSearchMatches(matchingShas);
  }, [matchingShas]);

  return (
    <div className="git-graph-app" data-testid="git-graph-app">
      {/* Top Toolbar */}
      <Toolbar
        onRefresh={handleRetry}
        onFetch={handleFetch}
        onStash={handleOpenStashSaveDialog}
        onManageStashes={handleOpenStashManager}
        searchDebounceMs={searchDebounceMs}
      />

      {/* Active Filters Bar */}
      <ActiveFiltersBar />

      {/* Main Content Area */}
      <main className="content-area" role="main">
        {errorMessage && !hasLiveCommits ? (
          isRebaseConflictError ? (
            <ErrorState
              message={errorMessage}
              onRetry={handleContinueRebase}
              retryText="Continue Rebase"
              secondaryAction={handleAbortRebase}
              secondaryText="Abort Rebase"
              tertiaryAction={handleSkipRebase}
              tertiaryText="Skip Patch"
            />
          ) : isCherryPickConflictError ? (
            <ErrorState
              message={errorMessage}
              onRetry={handleContinueCherryPick}
              retryText="Continue Cherry-pick"
              secondaryAction={handleAbortCherryPick}
              secondaryText="Abort Cherry-pick"
              tertiaryAction={handleSkipCherryPick}
              tertiaryText="Skip Patch"
            />
          ) : isMergeConflictError ? (
            <ErrorState
              title="Merge Conflict"
              message={errorMessage}
              onRetry={handleAbortMerge}
              retryText="Abort Merge"
              secondaryAction={handleRetry}
              secondaryText="Retry"
            />
          ) : (
            <ErrorState message={errorMessage} onRetry={handleRetry} retryText="Retry" />
          )
        ) : hasBootstrapped && repositories.length === 0 ? (
          <EmptyState onAction={handleScanRepositories} />
        ) : (
          <>
            {errorMessage && hasLiveCommits && (
              <div className="graph-alert-banner" role="alert" data-testid="graph-alert-banner">
                <div className="alert-content">
                  <span className="alert-icon">⚠️</span>
                  <span className="alert-text">{errorMessage}</span>
                </div>
                <div className="alert-actions">
                  {isMergeConflictError && (
                    <button
                      type="button"
                      className="alert-action-btn primary"
                      onClick={handleAbortMerge}
                      data-testid="alert-abort-merge-btn"
                    >
                      Abort Merge
                    </button>
                  )}
                  {isRebaseConflictError && (
                    <>
                      <button
                        type="button"
                        className="alert-action-btn primary"
                        onClick={handleContinueRebase}
                      >
                        Continue Rebase
                      </button>
                      <button
                        type="button"
                        className="alert-action-btn"
                        onClick={handleAbortRebase}
                      >
                        Abort Rebase
                      </button>
                      <button type="button" className="alert-action-btn" onClick={handleSkipRebase}>
                        Skip Patch
                      </button>
                    </>
                  )}
                  {isCherryPickConflictError && (
                    <>
                      <button
                        type="button"
                        className="alert-action-btn primary"
                        onClick={handleContinueCherryPick}
                      >
                        Continue
                      </button>
                      <button
                        type="button"
                        className="alert-action-btn"
                        onClick={handleAbortCherryPick}
                      >
                        Abort
                      </button>
                      <button
                        type="button"
                        className="alert-action-btn"
                        onClick={handleSkipCherryPick}
                      >
                        Skip
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="alert-action-btn"
                    onClick={handleDismissError}
                    data-testid="alert-dismiss-btn"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            {/* Repository Header Banner (Accessible for tests) */}
            <div
              className="repo-placeholder-banner sr-only"
              style={{ display: 'none' }}
              data-testid="repo-placeholder-banner"
            >
              <div className="repo-header-info">
                <h1 className="repo-title" data-testid="repo-name">
                  {activeRepo ? activeRepo.name : 'Git Graph Workspace'}
                </h1>
                <span className="repo-branch-pill" data-testid="repo-branch-pill">
                  ⌥ {activeRepo?.currentBranch ?? 'main'}
                </span>
                {activeRepo ? (
                  <span
                    className="repo-path"
                    title={'rootPath' in activeRepo ? activeRepo.rootPath : activeRepo.path}
                    data-testid="repo-path"
                  >
                    {'rootPath' in activeRepo ? activeRepo.rootPath : activeRepo.path}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Commit Graph Table / Search empty state */}
            {matchingShas.length === 0 && searchTerm ? (
              <div className="empty-search-state" data-testid="empty-search-state">
                <p className="empty-search-state-title">No commits found</p>
                <p>
                  No commits match &ldquo;{searchTerm}&rdquo; in branch &ldquo;{selectedBranch}
                  &rdquo;.
                </p>
              </div>
            ) : (
              <CommitList
                commits={displayCommits}
                repositoryId={activeRepo ? activeRepo.id : undefined}
                selectedCommitSha={selectedCommitSha}
                secondarySelectedCommitSha={secondarySelectedCommitSha}
                isDetailPanelOpen={isDetailPanelOpen}
                initialFocusChanges={focusChangesOnOpen}
                onCloseDetail={handleCloseDetail}
                onStashChanges={handleOpenStashSaveDialog}
                onSelectCommit={handleSelectCommit}
                onOpenDetail={handleOpenDetail}
                onContextMenu={handleContextMenu}
                rowHeight={rowHeight}
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={handleLoadMore}
                onCheckoutRef={hasLiveCommits ? handleCheckoutRef : undefined}
              />
            )}
            {contextMenu?.isOpen && (
              <CommitContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                commitSha={contextMenu.commitSha}
                commitMessage={contextMenu.commitMessage}
                parents={contextMenu.parents}
                body={contextMenu.body}
                refs={contextMenu.refs}
                targetRef={contextMenu.targetRef}
                onClose={closeContextMenu}
                onViewCommit={handleOpenDetail}
                onViewDetails={handleOpenDetail}
                onViewChanges={handleViewChanges}
                onCompareWithParent={handleCompareWithParent}
                onCompareWith={handleOpenCompareBranchDialog}
                onCopySha={handleCopySha}
                onCopyMessage={handleCopyMessage}
                onCheckout={hasLiveCommits ? handleCheckout : undefined}
                onCreateBranch={hasLiveCommits ? handleCreateBranch : undefined}
                onCreateTag={hasLiveCommits ? handleCreateTag : undefined}
                onDeleteTag={hasLiveCommits ? handleDeleteTag : undefined}
                onRenameBranch={handleRenameBranch}
                onDeleteBranch={handleDeleteBranch}
                onPushBranch={handlePushBranch}
                onPullBranch={handlePullBranch}
                onCreateArchive={handleCreateArchive}
                onToggleSelectBranch={handleToggleSelectBranch}
                onPinBranch={handlePinBranch}
                onCherryPick={hasLiveCommits ? handleCherryPick : undefined}
                onFixup={handleFixup}
                onSquashCommit={handleSquashCommit}
                onRevert={handleRevert}
                onResetLastCommit={hasLiveCommits ? handleResetLastCommit : undefined}
                onEditMessage={handleEditMessage}
                onDropCommit={handleDropCommit}
                onMerge={hasLiveCommits ? handleMerge : undefined}
                onRebase={hasLiveCommits ? handleRebase : undefined}
                onReset={hasLiveCommits ? handleReset : undefined}
                onSelectForCompare={handleCompareWithParent}
                onPinCommit={handlePinCommit}
              />
            )}
            {compareBranchDialog.isOpen && (
              <CompareBranchDialog
                sourceBranch={compareBranchDialog.sourceBranch}
                sourceSha={compareBranchDialog.sourceSha}
                isOpen={compareBranchDialog.isOpen}
                onClose={closeCompareBranchDialog}
                onCompare={handleExecuteCompareBranch}
              />
            )}
            {renameBranchDialog.isOpen && (
              <RenameBranchDialog
                branchName={renameBranchDialog.branchName}
                isOpen={renameBranchDialog.isOpen}
                onClose={closeRenameBranchDialog}
                onRename={handleExecuteRenameBranch}
              />
            )}
            {deleteBranchDialog.isOpen && (
              <DeleteBranchDialog
                branchName={deleteBranchDialog.branchName}
                isOpen={deleteBranchDialog.isOpen}
                onClose={closeDeleteBranchDialog}
                onDelete={handleExecuteDeleteBranch}
              />
            )}
            {createBranchDialog.isOpen && (
              <CreateBranchDialog
                commitSha={createBranchDialog.commitSha}
                isOpen={createBranchDialog.isOpen}
                onClose={closeCreateBranchDialog}
                onCreate={handleExecuteCreateBranch}
              />
            )}
            {createTagDialog.isOpen && (
              <CreateTagDialog
                commitSha={createTagDialog.commitSha}
                commitSubject={createTagDialog.commitSubject}
                remotes={repositoryRemotes}
                isOpen={createTagDialog.isOpen}
                onClose={closeCreateTagDialog}
                onCreate={handleExecuteCreateTag}
              />
            )}
            {deleteTagDialog.isOpen && (
              <DeleteTagDialog
                tagName={deleteTagDialog.tagName}
                remotes={repositoryRemotes}
                isOpen={deleteTagDialog.isOpen}
                onClose={closeDeleteTagDialog}
                onDelete={handleExecuteDeleteTag}
              />
            )}
            {mergeDialog.isOpen && (
              <MergeDialog
                target={mergeDialog.target}
                currentBranch={activeRepo?.currentBranch}
                isOpen={mergeDialog.isOpen}
                onClose={closeMergeDialog}
                onMerge={handleExecuteMerge}
              />
            )}
            {rebaseDialog.isOpen && (
              <RebaseDialog
                target={rebaseDialog.target}
                currentBranch={activeRepo?.currentBranch}
                isPublished={rebaseDialog.isPublished}
                upstream={rebaseDialog.upstream}
                isOpen={rebaseDialog.isOpen}
                onClose={closeRebaseDialog}
                onRebase={handleExecuteRebase}
              />
            )}
            {resetDialog.isOpen && (
              <ResetDialog
                target={resetDialog.target}
                targetSubject={resetDialog.targetSubject}
                targetAuthor={resetDialog.targetAuthor}
                targetDate={resetDialog.targetDate}
                initialMode={resetDialog.initialMode}
                isOpen={resetDialog.isOpen}
                onClose={closeResetDialog}
                onReset={handleExecuteReset}
              />
            )}
            {cherryPickDialog.isOpen && (
              <CherryPickDialog
                commitSha={cherryPickDialog.commitSha}
                commitSubject={cherryPickDialog.commitSubject}
                parents={cherryPickDialog.parents}
                parentSubjects={cherryPickDialog.parentSubjects}
                isOpen={cherryPickDialog.isOpen}
                onClose={closeCherryPickDialog}
                onCherryPick={handleExecuteCherryPick}
              />
            )}
            {revertDialog.isOpen && (
              <RevertDialog
                commitSha={revertDialog.commitSha}
                commitSubject={revertDialog.commitSubject}
                parents={revertDialog.parents}
                parentSubjects={revertDialog.parentSubjects}
                isOpen={revertDialog.isOpen}
                onClose={closeRevertDialog}
                onRevert={handleExecuteRevert}
              />
            )}
            {stashSaveDialogOpen && (
              <StashSaveDialog
                isOpen={stashSaveDialogOpen}
                onClose={() => setStashSaveDialogOpen(false)}
                onSave={handleSaveStash}
              />
            )}
            {stashManagerOpen && (
              <StashManagerDialog
                isOpen={stashManagerOpen}
                stashes={stashes}
                isLoading={isLoadingStashes}
                onClose={() => setStashManagerOpen(false)}
                onApply={handleApplyStash}
                onPop={handlePopStash}
                onDrop={handleDropStash}
                onCreateStash={() => {
                  setStashManagerOpen(false);
                  setStashSaveDialogOpen(true);
                }}
              />
            )}
            {toast && <Toast toast={toast} />}
          </>
        )}
      </main>

      {/* Footer / Status Bar (Hidden for full height table) */}
      <footer className="status-bar" role="contentinfo" style={{ display: 'none' }}>
        <div className="status-left">
          <span
            className={`status-dot ${hasBootstrapped ? '' : 'connecting'}`}
            title={hasBootstrapped ? 'Connected' : 'Waiting for Extension Host'}
            data-testid="status-indicator"
          />
          <span data-testid="status-text">
            {hasBootstrapped ? 'Connected (Protocol v1)' : 'Connecting to Extension Host...'}
          </span>
        </div>
        <div className="status-right">
          <span>
            {repositories.length === 0
              ? 'No repositories detected'
              : `${repositories.length} repository detected`}
          </span>
        </div>
      </footer>
    </div>
  );
};
