import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { AppErrorCode } from '@git-graph/shared';
import type { GitRef, OperationResetMode, RebasePlanEntry, SearchType } from '@git-graph/shared';
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
import { InteractiveRebaseDialog } from '../dialogs/InteractiveRebaseDialog';
import { ResetDialog } from '../dialogs/ResetDialog';
import { CherryPickDialog } from '../dialogs/CherryPickDialog';
import { RevertDialog } from '../dialogs/RevertDialog';
import { StashSaveDialog } from '../dialogs/StashSaveDialog';
import { StashManagerDialog } from '../dialogs/StashManagerDialog';
import { FetchDialog } from '../dialogs/FetchDialog';
import type { FetchDialogOptions } from '../dialogs/FetchDialog';
import { PullDialog } from '../dialogs/PullDialog';
import type { PullDialogOptions } from '../dialogs/PullDialog';
import { PushDialog } from '../dialogs/PushDialog';
import type { PushDialogOptions } from '../dialogs/PushDialog';
import { RemoteManagerDialog } from '../dialogs/RemoteManagerDialog';
import { WorktreeManagerDialog } from '../dialogs/WorktreeManagerDialog';
import { SubmoduleStatusDialog } from '../dialogs/SubmoduleStatusDialog';
import { BranchDropActionDialog, type BranchDropAction } from '../dialogs/BranchDropActionDialog';
import { SettingsDialog } from '../settings/SettingsDialog';
import { useBranchTouchDrag } from '../../hooks/useBranchTouchDrag';
import { useRepositoryStore } from '../../stores/repositoryStore';
import { useGraphStore } from '../../stores/graphStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useDetailsStore, buildDetailsCacheKey } from '../../stores/detailsStore';
import { useDiffStore } from '../../stores/diffStore';
import { useConfigStore } from '../../stores/configStore';
import {
  useInteractiveRebaseStore,
  type InteractiveRebaseInitialAction,
} from '../../stores/interactiveRebaseStore';
import { useCommitRows, type NormalizedCommit } from '../../hooks/useCommitRows';
import { formatGitGraphDate } from '../common/dateUtils';
import { useToast } from '../../hooks/useToast';
import { Toast } from '../../components/ui/Toast';
import type { OperationMergeFastForwardMode, OperationUndoInfo, TagType } from '@git-graph/shared';
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
  requestInteractiveRebasePlan,
  requestInteractiveRebaseStart,
  requestInteractiveRebaseAction,
  requestCherryPick,
  requestCherryPickAction,
  requestRevert,
  requestReset,
  requestPull,
  requestFetch,
  requestRemoteList,
  requestAddRemote,
  requestRemoveRemote,
  requestRenameRemote,
  requestSetRemoteUrl,
  requestUndo,
  requestSyncStatus,
  requestSaveStash,
  requestStashList,
  requestPopStash,
  requestApplyStash,
  requestDropStash,
  requestAddGitWorktree,
  requestRemoveGitWorktree,
  requestOpenGitWorktreeInNewWindow,
  requestOpenSubmodule,
} from '../../messaging/messageRouter';
import { useWorktreeStore } from '../../stores/worktreeStore';
import { useOperationStore } from '../../stores/operationStore';
import { useRemoteStore } from '../../stores/remoteStore';
import { useGitWorktreeStore } from '../../stores/gitWorktreeStore';
import { useSubmoduleStore } from '../../stores/submoduleStore';
import { useUiStore } from '../../stores/uiStore';

export type { NormalizedCommit };

const BRANCH_DRAG_MIME = 'application/x-git-graph-branch';

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

  const syncStatus = useRepositoryStore((s) => s.syncStatus);
  const remotes = useRemoteStore((s) => s.remotes);
  const remotesLoading = useRemoteStore((s) => s.isLoading);
  const remotesError = useRemoteStore((s) => s.error);
  const requestedDialog = useUiStore((s) => s.requestedDialog);
  const operationProgress = useOperationStore((s) => s.progress);
  const operationMessage = useOperationStore((s) => s.message);
  const operationActiveId = useOperationStore((s) => s.activeRequestId);
  const lastOperationResult = useOperationStore((s) => s.lastResult);

  const defaultRemote = useMemo(() => {
    const names = remotes.map((remote) => remote.name);
    const upstreamRemote = syncStatus?.upstream?.split('/')[0];
    if (upstreamRemote && names.includes(upstreamRemote)) {
      return upstreamRemote;
    }
    if (names.includes('origin')) {
      return 'origin';
    }
    return names[0];
  }, [remotes, syncStatus?.upstream]);

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
  const [fetchDialogOpen, setFetchDialogOpen] = useState(false);
  const [pullDialogOpen, setPullDialogOpen] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [remoteManagerOpen, setRemoteManagerOpen] = useState(false);
  const [worktreeDialogOpen, setWorktreeDialogOpen] = useState(false);
  const [submoduleDialogOpen, setSubmoduleDialogOpen] = useState(false);
  const [worktreeDialogError, setWorktreeDialogError] = useState<string | null>(null);
  const [submoduleDialogError, setSubmoduleDialogError] = useState<string | null>(null);
  const [pullDefaults, setPullDefaults] = useState<{ remote?: string; branch?: string }>({});
  const [pushTargetBranch, setPushTargetBranch] = useState<string | undefined>(undefined);
  const [syncDialogError, setSyncDialogError] = useState<string | null>(null);
  const [pendingUndoRequestId, setPendingUndoRequestId] = useState<string | null>(null);
  const [activeDialogOperation, setActiveDialogOperation] = useState<{
    id: string;
    kind: 'fetch' | 'pull' | 'push' | 'remote' | 'worktree';
  } | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [dropTargetSha, setDropTargetSha] = useState<string | null>(null);
  const [branchDropDialog, setBranchDropDialog] = useState<{
    isOpen: boolean;
    source: RefBadgeItem | null;
    targetSha: string | null;
  }>({ isOpen: false, source: null, targetSha: null });
  const dragSourceRef = useRef<RefBadgeItem | null>(null);
  const stashes = useWorktreeStore((s) => s.stashes);
  const isLoadingStashes = useWorktreeStore((s) => s.isLoadingStashes);
  const gitWorktrees = useGitWorktreeStore((s) => s.worktrees);
  const currentWorktreePath = useGitWorktreeStore((s) => s.currentPath);
  const isLoadingWorktrees = useGitWorktreeStore((s) => s.isLoading);
  const worktreesError = useGitWorktreeStore((s) => s.error);
  const submodules = useSubmoduleStore((s) => s.submodules);
  const isLoadingSubmodules = useSubmoduleStore((s) => s.isLoading);
  const submodulesError = useSubmoduleStore((s) => s.error);

  const errorMessage = repoError || graphError;
  const isMergeConflictError = Boolean(
    errorMessage &&
    (errorMessage.includes('Merge stopped with conflicts') ||
      errorMessage.includes('git merge') ||
      errorMessage.includes('Automatic merge failed')),
  );
  const isRebaseConflictError = Boolean(
    errorMessage &&
    errorMessage.toLowerCase().includes('rebase') &&
    errorMessage.includes('stopped with conflicts'),
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

  const refreshRemotes = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    requestRemoteList(activeRepo.id);
  }, [activeRepo]);

  const openFetchDialog = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    setSyncDialogError(null);
    setActiveDialogOperation(null);
    refreshRemotes();
    setFetchDialogOpen(true);
  }, [activeRepo, refreshRemotes]);

  const openPullDialog = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    setSyncDialogError(null);
    setActiveDialogOperation(null);
    setPullDefaults({});
    refreshRemotes();
    setPullDialogOpen(true);
  }, [activeRepo, refreshRemotes]);

  const openPushDialog = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    setSyncDialogError(null);
    setActiveDialogOperation(null);
    setPushTargetBranch(undefined);
    refreshRemotes();
    requestSyncStatus(activeRepo.id);
    setPushDialogOpen(true);
  }, [activeRepo, refreshRemotes]);

  const openRemoteManager = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    setSyncDialogError(null);
    setActiveDialogOperation(null);
    setRemoteManagerOpen(true);
  }, [activeRepo]);

  const refreshWorktrees = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    setWorktreeDialogError(null);
    useGitWorktreeStore.getState().requestWorktrees(activeRepo.id);
  }, [activeRepo]);

  const refreshSubmodules = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    setSubmoduleDialogError(null);
    useSubmoduleStore.getState().requestSubmodules(activeRepo.id);
  }, [activeRepo]);

  const openWorktreeManager = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    setWorktreeDialogError(null);
    setActiveDialogOperation(null);
    setWorktreeDialogOpen(true);
    refreshWorktrees();
  }, [activeRepo, refreshWorktrees]);

  const openSubmoduleStatus = useCallback(() => {
    if (!activeRepo) {
      return;
    }
    setSubmoduleDialogError(null);
    setSubmoduleDialogOpen(true);
    refreshSubmodules();
  }, [activeRepo, refreshSubmodules]);

  const handleAddWorktree = useCallback(
    (path: string, branch?: string, newBranch?: string) => {
      if (!activeRepo) {
        return;
      }
      setWorktreeDialogError(null);
      const requestId = requestAddGitWorktree({
        repositoryId: activeRepo.id,
        path,
        ...(branch ? { branch } : {}),
        ...(newBranch ? { newBranch } : {}),
      });
      if (requestId) {
        setActiveDialogOperation({ id: requestId, kind: 'worktree' });
      }
    },
    [activeRepo],
  );

  const handleRemoveWorktree = useCallback(
    (path: string, force: boolean) => {
      if (!activeRepo) {
        return;
      }
      setWorktreeDialogError(null);
      const requestId = requestRemoveGitWorktree({
        repositoryId: activeRepo.id,
        path,
        force,
      });
      if (requestId) {
        setActiveDialogOperation({ id: requestId, kind: 'worktree' });
      }
    },
    [activeRepo],
  );

  const handleOpenWorktree = useCallback(
    (path: string) => {
      if (!activeRepo) {
        return;
      }
      requestOpenGitWorktreeInNewWindow({ repositoryId: activeRepo.id, path });
    },
    [activeRepo],
  );

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

  const openBranchDropDialog = useCallback(
    (source: RefBadgeItem, targetSha: string) => {
      const commit = rawCommits.find(
        (candidate) =>
          candidate.sha === targetSha ||
          candidate.shortSha === targetSha ||
          candidate.sha.startsWith(targetSha),
      );
      if (!commit) return;
      if (
        source.targetSha &&
        (commit.sha === source.targetSha || commit.sha.startsWith(source.targetSha))
      ) {
        return;
      }
      setBranchDropDialog({ isOpen: true, source, targetSha: commit.sha });
    },
    [rawCommits],
  );

  const handleRefDragStart = useCallback(
    (refItem: RefBadgeItem, event: React.DragEvent<HTMLSpanElement>) => {
      if (!hasLiveCommits || (refItem.type !== 'localBranch' && refItem.type !== 'branch')) {
        event.preventDefault();
        return;
      }
      dragSourceRef.current = refItem;
      setDropTargetSha(null);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(
          BRANCH_DRAG_MIME,
          JSON.stringify({
            name: refItem.name,
            targetSha: refItem.targetSha,
            type: refItem.type,
          }),
        );
        event.dataTransfer.setData('text/plain', refItem.name);
      }
    },
    [hasLiveCommits],
  );

  const handleRefDragEnd = useCallback(() => {
    dragSourceRef.current = null;
    setDropTargetSha(null);
  }, []);

  const handleCommitDragOver = useCallback(
    (sha: string, event: React.DragEvent<HTMLTableRowElement>) => {
      const source = dragSourceRef.current;
      const hasBranchPayload =
        source !== null ||
        (event.dataTransfer?.types
          ? Array.from(event.dataTransfer.types).includes(BRANCH_DRAG_MIME)
          : false);
      if (!hasBranchPayload) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      setDropTargetSha((prev) => (prev === sha ? prev : sha));
    },
    [],
  );

  const handleCommitDragLeave = useCallback(
    (sha: string, event: React.DragEvent<HTMLTableRowElement>) => {
      if (!dragSourceRef.current) return;
      const relatedTarget = event.relatedTarget as Node | null;
      if (relatedTarget && event.currentTarget.contains(relatedTarget)) return;
      setDropTargetSha((prev) => (prev === sha ? null : prev));
    },
    [],
  );

  const handleCommitDrop = useCallback(
    (sha: string, event: React.DragEvent<HTMLTableRowElement>) => {
      let source = dragSourceRef.current;
      if (!source) {
        const raw = event.dataTransfer?.getData?.(BRANCH_DRAG_MIME);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as {
              name?: string;
              targetSha?: string;
              type?: RefBadgeItem['type'];
            };
            if (parsed.name && parsed.type) {
              source = { name: parsed.name, type: parsed.type, targetSha: parsed.targetSha };
            }
          } catch {
            source = null;
          }
        }
      }
      if (!source) return;
      event.preventDefault();
      event.stopPropagation();
      dragSourceRef.current = null;
      setDropTargetSha(null);
      openBranchDropDialog(source, sha);
    },
    [openBranchDropDialog],
  );

  const { dragState: touchDragState, handleTouchStart: handleBranchTouchStart } =
    useBranchTouchDrag({
      onStart: (source) => {
        dragSourceRef.current = source;
        setDropTargetSha(null);
      },
      onTargetChange: (sha) => setDropTargetSha(sha),
      onDrop: (source, sha) => openBranchDropDialog(source, sha),
      onCancel: () => {
        dragSourceRef.current = null;
        setDropTargetSha(null);
      },
    });

  const handleRefTouchStart = useCallback(
    (refItem: RefBadgeItem, event: React.TouchEvent<HTMLSpanElement>) => {
      if (refItem.type !== 'localBranch' && refItem.type !== 'branch') return;
      handleBranchTouchStart(refItem, event);
    },
    [handleBranchTouchStart],
  );

  const handleBranchDropConfirm = useCallback(
    (action: BranchDropAction, source: RefBadgeItem) => {
      const targetSha = branchDropDialog.targetSha;
      if (!targetSha) return;
      if (action === 'merge') {
        handleMerge(source.name);
      } else if (action === 'rebase') {
        handleRebase(targetSha);
      } else {
        handleReset(targetSha, 'mixed');
      }
    },
    [branchDropDialog.targetSha, handleMerge, handleRebase, handleReset],
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

  const resolveRemoteBranch = useCallback(
    (branchName: string): { remote?: string; branch: string } => {
      const cleanName = branchName.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\//, '');
      const remoteName = remotes
        .map((remote) => remote.name)
        .find((name) => cleanName.startsWith(`${name}/`));
      if (remoteName) {
        return { remote: remoteName, branch: cleanName.slice(remoteName.length + 1) };
      }
      return { branch: cleanName };
    },
    [remotes],
  );

  const handlePushBranch = useCallback(
    (branchName: string) => {
      if (!activeRepo) {
        return;
      }
      const { branch } = resolveRemoteBranch(branchName);
      setSyncDialogError(null);
      setActiveDialogOperation(null);
      setPushTargetBranch(branch);
      refreshRemotes();
      requestSyncStatus(activeRepo.id);
      setPushDialogOpen(true);
    },
    [activeRepo, refreshRemotes, resolveRemoteBranch],
  );

  const handlePullBranch = useCallback(
    (branchName: string) => {
      if (!activeRepo) {
        return;
      }
      const { remote, branch } = resolveRemoteBranch(branchName);
      const resolvedRemote = remote ?? defaultRemote;
      setSyncDialogError(null);
      setActiveDialogOperation(null);
      setPullDefaults({
        ...(resolvedRemote ? { remote: resolvedRemote } : {}),
        branch,
      });
      refreshRemotes();
      setPullDialogOpen(true);
    },
    [activeRepo, defaultRemote, refreshRemotes, resolveRemoteBranch],
  );

  const handleExecuteFetch = useCallback(
    (options: FetchDialogOptions) => {
      if (!activeRepo) {
        return;
      }
      setSyncDialogError(null);
      const id = requestFetch({
        repositoryId: activeRepo.id,
        ...(options.remote ? { remote: options.remote } : {}),
        prune: options.prune,
        all: options.all,
      });
      if (id) {
        setActiveDialogOperation({ id, kind: 'fetch' });
      }
    },
    [activeRepo],
  );

  const handleExecutePull = useCallback(
    (options: PullDialogOptions) => {
      if (!activeRepo) {
        return;
      }
      setSyncDialogError(null);
      const id = requestPull({
        repositoryId: activeRepo.id,
        ...(options.remote ? { remote: options.remote } : {}),
        branch: options.branch,
        strategy: options.strategy,
        autostash: options.autostash,
      });
      if (id) {
        setActiveDialogOperation({ id, kind: 'pull' });
      }
    },
    [activeRepo],
  );

  const handleExecutePush = useCallback(
    (options: PushDialogOptions) => {
      if (!activeRepo) {
        return;
      }
      setSyncDialogError(null);
      const id = requestPushBranch({
        repositoryId: activeRepo.id,
        branchName: options.branchName,
        remote: options.remote,
        setUpstream: options.setUpstream,
        forceWithLease: options.forceWithLease,
        tags: options.tags,
      });
      if (id) {
        setActiveDialogOperation({ id, kind: 'push' });
      }
    },
    [activeRepo],
  );

  const handleAddRemote = useCallback(
    (name: string, url: string) => {
      if (!activeRepo) {
        return;
      }
      setSyncDialogError(null);
      const id = requestAddRemote({ repositoryId: activeRepo.id, name, url });
      if (id) {
        setActiveDialogOperation({ id, kind: 'remote' });
      }
    },
    [activeRepo],
  );

  const handleRemoveRemote = useCallback(
    (name: string) => {
      if (!activeRepo) {
        return;
      }
      setSyncDialogError(null);
      const id = requestRemoveRemote({ repositoryId: activeRepo.id, name });
      if (id) {
        setActiveDialogOperation({ id, kind: 'remote' });
      }
    },
    [activeRepo],
  );

  const handleRenameRemote = useCallback(
    (oldName: string, newName: string) => {
      if (!activeRepo) {
        return;
      }
      setSyncDialogError(null);
      const id = requestRenameRemote({ repositoryId: activeRepo.id, oldName, newName });
      if (id) {
        setActiveDialogOperation({ id, kind: 'remote' });
      }
    },
    [activeRepo],
  );

  const handleSetRemoteUrl = useCallback(
    (name: string, url: string, push?: boolean) => {
      if (!activeRepo) {
        return;
      }
      setSyncDialogError(null);
      const id = requestSetRemoteUrl({
        repositoryId: activeRepo.id,
        name,
        url,
        ...(push !== undefined ? { push } : {}),
      });
      if (id) {
        setActiveDialogOperation({ id, kind: 'remote' });
      }
    },
    [activeRepo],
  );

  const handleUndo = useCallback(
    (undo: OperationUndoInfo) => {
      if (!activeRepo) {
        return;
      }
      const id = requestUndo({
        repositoryId: activeRepo.id,
        ...(undo.reflogIndex !== undefined ? { reflogIndex: undo.reflogIndex } : {}),
        ...(undo.expectedSha ? { expectedSha: undo.expectedSha } : {}),
      });
      if (id) {
        setPendingUndoRequestId(id);
      }
    },
    [activeRepo],
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

  const openInteractiveRebase = useCallback(
    (onto: string, initialAction?: InteractiveRebaseInitialAction) => {
      if (!activeRepo || !onto) {
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

      useInteractiveRebaseStore.getState().open({
        repositoryId: activeRepo.id,
        onto,
        isPublished: Boolean(branchRef?.upstream),
        ...(branchRef?.upstream ? { upstream: branchRef.upstream } : {}),
        ...(initialAction ? { initialAction } : {}),
      });
      requestInteractiveRebasePlan(onto, activeRepo.id);
    },
    [activeRepo, rawCommits],
  );

  const handleInteractiveRebase = useCallback(
    (sha: string) => {
      const parent = rawCommits.find((commit) => commit.sha === sha)?.parents[0];
      if (!parent) {
        showToast('Cannot start an interactive rebase from a root commit.', 'error');
        return;
      }
      openInteractiveRebase(parent);
    },
    [rawCommits, openInteractiveRebase, showToast],
  );

  const handleFixup = useCallback(
    (sha: string) => {
      const parent = rawCommits.find((commit) => commit.sha === sha)?.parents[0];
      if (!parent) {
        showToast('Cannot fixup a root commit.', 'error');
        return;
      }
      openInteractiveRebase(`${parent}^`, { sha, action: 'fixup' });
    },
    [rawCommits, openInteractiveRebase, showToast],
  );

  const handleSquashCommit = useCallback(
    (sha: string) => {
      const parent = rawCommits.find((commit) => commit.sha === sha)?.parents[0];
      if (!parent) {
        showToast('Cannot squash a root commit.', 'error');
        return;
      }
      openInteractiveRebase(`${parent}^`, { sha, action: 'squash' });
    },
    [rawCommits, openInteractiveRebase, showToast],
  );

  const handleEditMessage = useCallback(
    (sha: string) => {
      const target = rawCommits.find((commit) => commit.sha === sha);
      const parent = target?.parents[0];
      if (!parent) {
        showToast('Cannot edit the message of a root commit.', 'error');
        return;
      }
      openInteractiveRebase(parent, {
        sha,
        action: 'reword',
        ...(target?.subject ? { message: target.subject } : {}),
      });
    },
    [rawCommits, openInteractiveRebase, showToast],
  );

  const handleDropCommit = useCallback(
    (sha: string) => {
      const parent = rawCommits.find((commit) => commit.sha === sha)?.parents[0];
      if (!parent) {
        showToast('Cannot drop a root commit.', 'error');
        return;
      }
      openInteractiveRebase(parent, { sha, action: 'drop' });
    },
    [rawCommits, openInteractiveRebase, showToast],
  );

  const handleStartInteractiveRebase = useCallback(
    (entries: RebasePlanEntry[], confirmedPublishedBranch: boolean) => {
      if (!activeRepo) {
        return;
      }
      const { onto } = useInteractiveRebaseStore.getState();
      if (!onto) {
        return;
      }
      requestInteractiveRebaseStart({
        repositoryId: activeRepo.id,
        onto,
        plan: entries,
        ...(confirmedPublishedBranch ? { confirmedPublishedBranch: true } : {}),
      });
      showToast('Starting interactive rebase...', 'loading', 3000);
    },
    [activeRepo, showToast],
  );

  const handleContinueInteractiveRebase = useCallback(() => {
    requestInteractiveRebaseAction('continue');
  }, []);

  const handleAbortInteractiveRebase = useCallback(() => {
    requestInteractiveRebaseAction('abort');
  }, []);

  const handleSkipInteractiveRebase = useCallback(() => {
    requestInteractiveRebaseAction('skip');
  }, []);

  const handleCloseInteractiveRebase = useCallback(() => {
    useInteractiveRebaseStore.getState().close();
  }, []);

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
  const closeBranchDropDialog = useCallback(
    () => setBranchDropDialog((prev) => ({ ...prev, isOpen: false })),
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
  const closeFetchDialog = useCallback(() => {
    setFetchDialogOpen(false);
    setSyncDialogError(null);
  }, []);
  const closePullDialog = useCallback(() => {
    setPullDialogOpen(false);
    setSyncDialogError(null);
  }, []);
  const closePushDialog = useCallback(() => {
    setPushDialogOpen(false);
    setSyncDialogError(null);
  }, []);
  const closeRemoteManager = useCallback(() => {
    setRemoteManagerOpen(false);
    setSyncDialogError(null);
  }, []);
  const closeSettingsDialog = useCallback(() => setSettingsDialogOpen(false), []);
  const openSettingsDialog = useCallback(() => setSettingsDialogOpen(true), []);

  useEffect(() => {
    if (!requestedDialog || !activeRepo) {
      return;
    }
    switch (requestedDialog) {
      case 'fetch':
        openFetchDialog();
        break;
      case 'pull':
        openPullDialog();
        break;
      case 'push':
        openPushDialog();
        break;
      case 'remotes':
        openRemoteManager();
        break;
      case 'worktrees':
        openWorktreeManager();
        break;
    }
    useUiStore.getState().clearRequestedDialog();
  }, [
    requestedDialog,
    activeRepo,
    openFetchDialog,
    openPullDialog,
    openPushDialog,
    openRemoteManager,
    openWorktreeManager,
  ]);

  useEffect(() => {
    if (activeRepo) {
      requestSyncStatus(activeRepo.id);
    }
  }, [activeRepo]);

  useEffect(() => {
    const result = lastOperationResult;
    if (!result) {
      return;
    }
    const clearResult = () => useOperationStore.getState().clearLastResult();
    const message = result.error?.message ?? 'Operation failed.';

    if (pendingUndoRequestId === result.requestId) {
      setPendingUndoRequestId(null);
      if (result.success) {
        showToast('Last operation undone.', 'success', 4000);
      } else if (result.error?.code === AppErrorCode.OPERATION_CANCELLED) {
        showToast(message, 'info', 3000);
      } else {
        showToast(message, 'error', 6000);
      }
      clearResult();
      return;
    }

    const activeMatches = activeDialogOperation?.id === result.requestId;
    const kind = activeMatches ? activeDialogOperation.kind : null;

    if (activeMatches) {
      setActiveDialogOperation(null);
      if (!result.success) {
        if (kind === 'worktree') {
          setWorktreeDialogError(message);
        } else {
          setSyncDialogError(message);
        }
        clearResult();
        return;
      }
      setSyncDialogError(null);
      switch (kind) {
        case 'fetch':
          setFetchDialogOpen(false);
          showToast('Fetch complete.', 'success', 4000);
          break;
        case 'pull':
          setPullDialogOpen(false);
          showToast('Pull complete.', 'success', 4000);
          break;
        case 'push':
          setPushDialogOpen(false);
          showToast(result.undo?.reason ?? 'Push complete.', 'info', 5000);
          break;
        case 'remote':
          refreshRemotes();
          showToast('Remote updated.', 'success', 3000);
          break;
        case 'worktree':
          refreshWorktrees();
          showToast('Worktree updated.', 'success', 3000);
          break;
      }
    }

    if (!result.success) {
      if (remoteManagerOpen) {
        setSyncDialogError(message);
      }
      if (!activeMatches) {
        showToast(message, 'error', 6000);
      }
      clearResult();
      return;
    }

    const undo = result.undo;
    if (undo?.available) {
      const undoInfo = undo;
      showToast(`${undo.label ?? 'Last operation'} completed.`, 'success', 10000, {
        label: 'Undo',
        onClick: () => handleUndo(undoInfo),
      });
    } else if (undo?.reason && !activeMatches) {
      showToast(undo.reason, 'info', 5000);
    } else if (remoteManagerOpen && !activeMatches) {
      refreshRemotes();
      showToast('Remote updated.', 'success', 3000);
    }

    clearResult();
  }, [
    activeDialogOperation,
    handleUndo,
    lastOperationResult,
    pendingUndoRequestId,
    refreshRemotes,
    refreshWorktrees,
    remoteManagerOpen,
    showToast,
  ]);

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

  const worktreeBranches = useMemo(() => {
    const branches = new Map<string, string>();
    for (const worktree of gitWorktrees) {
      if (worktree.branch && !worktree.isCurrent) {
        branches.set(worktree.branch, worktree.path);
      }
    }
    return branches;
  }, [gitWorktrees]);

  const dialogProgress =
    activeDialogOperation && operationActiveId === activeDialogOperation.id ? operationProgress : 0;
  const dialogProgressMessage =
    activeDialogOperation && operationActiveId === activeDialogOperation.id
      ? (operationMessage ?? undefined)
      : undefined;

  return (
    <div className="git-graph-app" data-testid="git-graph-app">
      {/* Top Toolbar */}
      <Toolbar
        onRefresh={handleRetry}
        onFetch={openFetchDialog}
        onPull={openPullDialog}
        onPush={openPushDialog}
        onManageRemotes={openRemoteManager}
        onManageWorktrees={openWorktreeManager}
        onManageSubmodules={openSubmoduleStatus}
        submoduleCount={submodules.length}
        onStash={handleOpenStashSaveDialog}
        onManageStashes={handleOpenStashManager}
        onOpenSettings={openSettingsDialog}
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
              <div
                className="graph-alert-banner"
                role="alert"
                aria-live="assertive"
                data-testid="graph-alert-banner"
              >
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
                draggableRefs={hasLiveCommits}
                onRefDragStart={handleRefDragStart}
                onRefDragEnd={handleRefDragEnd}
                onRefTouchStart={handleRefTouchStart}
                dropTargetSha={dropTargetSha}
                onDragOverCommit={handleCommitDragOver}
                onDragLeaveCommit={handleCommitDragLeave}
                onDropCommit={handleCommitDrop}
                worktreeBranches={worktreeBranches}
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
                onInteractiveRebase={hasLiveCommits ? handleInteractiveRebase : undefined}
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
            <InteractiveRebaseDialog
              onClose={handleCloseInteractiveRebase}
              onStart={handleStartInteractiveRebase}
              onContinue={handleContinueInteractiveRebase}
              onAbort={handleAbortInteractiveRebase}
              onSkip={handleSkipInteractiveRebase}
            />
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
            {branchDropDialog.isOpen && (
              <BranchDropActionDialog
                isOpen={branchDropDialog.isOpen}
                source={branchDropDialog.source}
                targetSha={branchDropDialog.targetSha}
                targetShortSha={
                  rawCommits.find((commit) => commit.sha === branchDropDialog.targetSha)?.shortSha
                }
                onClose={closeBranchDropDialog}
                onConfirm={handleBranchDropConfirm}
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
            <FetchDialog
              isOpen={fetchDialogOpen}
              remotes={remotes}
              defaultRemote={defaultRemote}
              progress={dialogProgress}
              progressMessage={dialogProgressMessage}
              isRunning={activeDialogOperation?.kind === 'fetch'}
              error={syncDialogError}
              onClose={closeFetchDialog}
              onFetch={handleExecuteFetch}
            />
            <PullDialog
              isOpen={pullDialogOpen}
              currentBranch={activeRepo?.currentBranch}
              remotes={remotes}
              defaultRemote={pullDefaults.remote ?? defaultRemote}
              defaultBranch={pullDefaults.branch}
              progress={dialogProgress}
              progressMessage={dialogProgressMessage}
              isRunning={activeDialogOperation?.kind === 'pull'}
              error={syncDialogError}
              onClose={closePullDialog}
              onPull={handleExecutePull}
            />
            <PushDialog
              isOpen={pushDialogOpen}
              branchName={pushTargetBranch}
              currentBranch={activeRepo?.currentBranch}
              remotes={remotes}
              defaultRemote={defaultRemote}
              upstream={
                pushTargetBranch && pushTargetBranch !== activeRepo?.currentBranch
                  ? undefined
                  : syncStatus?.upstream
              }
              ahead={
                pushTargetBranch && pushTargetBranch !== activeRepo?.currentBranch
                  ? 0
                  : (syncStatus?.ahead ?? 0)
              }
              behind={
                pushTargetBranch && pushTargetBranch !== activeRepo?.currentBranch
                  ? 0
                  : (syncStatus?.behind ?? 0)
              }
              progress={dialogProgress}
              progressMessage={dialogProgressMessage}
              isRunning={activeDialogOperation?.kind === 'push'}
              error={syncDialogError}
              onClose={closePushDialog}
              onPush={handleExecutePush}
            />
            <RemoteManagerDialog
              isOpen={remoteManagerOpen}
              remotes={remotes}
              isLoading={remotesLoading}
              error={syncDialogError ?? remotesError}
              isRunning={activeDialogOperation?.kind === 'remote'}
              onClose={closeRemoteManager}
              onRefresh={refreshRemotes}
              onAdd={handleAddRemote}
              onRemove={handleRemoveRemote}
              onRename={handleRenameRemote}
              onSetUrl={handleSetRemoteUrl}
            />
            <WorktreeManagerDialog
              isOpen={worktreeDialogOpen}
              worktrees={gitWorktrees}
              currentPath={currentWorktreePath}
              isLoading={isLoadingWorktrees}
              error={worktreeDialogError ?? worktreesError}
              isRunning={activeDialogOperation?.kind === 'worktree'}
              onClose={() => setWorktreeDialogOpen(false)}
              onRefresh={refreshWorktrees}
              onAdd={handleAddWorktree}
              onRemove={handleRemoveWorktree}
              onOpen={handleOpenWorktree}
            />
            <SubmoduleStatusDialog
              isOpen={submoduleDialogOpen}
              submodules={submodules}
              isLoading={isLoadingSubmodules}
              error={submoduleDialogError ?? submodulesError}
              onClose={() => setSubmoduleDialogOpen(false)}
              onRefresh={refreshSubmodules}
              onOpen={(submodulePath) => {
                if (activeRepo) {
                  requestOpenSubmodule({ repositoryId: activeRepo.id, path: submodulePath });
                }
              }}
            />
            {toast && <Toast toast={toast} />}
          </>
        )}
      </main>

      <SettingsDialog isOpen={settingsDialogOpen} onClose={closeSettingsDialog} />

      {touchDragState && (
        <div
          className="branch-drag-ghost"
          style={{ left: touchDragState.x + 12, top: touchDragState.y + 12 }}
          aria-hidden="true"
          data-testid="branch-drag-ghost"
        >
          {touchDragState.source.name}
        </div>
      )}

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
