import { create } from 'zustand';
import type {
  OperationProgressPayload,
  OperationResultPayload,
  RebasePlanAction,
  RebasePlanEntry,
} from '@git-graph/shared';

export type InteractiveRebaseStatus =
  | 'idle'
  | 'planning'
  | 'ready'
  | 'running'
  | 'aborting'
  | 'paused'
  | 'conflict'
  | 'completed'
  | 'aborted'
  | 'failed';

export interface InteractiveRebaseInitialAction {
  sha: string;
  action: RebasePlanAction;
  message?: string;
}

export interface OpenInteractiveRebaseOptions {
  repositoryId: string;
  onto: string;
  isPublished: boolean;
  upstream?: string;
  initialAction?: InteractiveRebaseInitialAction;
}

export interface InteractiveRebaseStoreState {
  isOpen: boolean;
  repositoryId: string | null;
  onto: string;
  entries: RebasePlanEntry[];
  pendingAction: InteractiveRebaseInitialAction | null;
  currentStep: number;
  totalSteps: number;
  status: InteractiveRebaseStatus;
  conflicts: string[];
  error: string | null;
  isPublished: boolean;
  upstream?: string;
  confirmedPublishedBranch: boolean;
  activeRequestId: string | null;
}

export interface InteractiveRebaseStoreActions {
  open: (options: OpenInteractiveRebaseOptions) => void;
  close: () => void;
  receivePlan: (entries: RebasePlanEntry[], onto: string, error?: string) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  setAction: (index: number, action: RebasePlanAction) => void;
  setMessage: (index: number, message: string) => void;
  setConfirmedPublishedBranch: (confirmed: boolean) => void;
  startRebase: (requestId?: string) => void;
  continueRebase: (requestId?: string) => void;
  abortRebase: (requestId?: string) => void;
  skipRebase: (requestId?: string) => void;
  receiveProgress: (payload: OperationProgressPayload) => void;
  receiveResult: (payload: OperationResultPayload) => void;
  reset: () => void;
}

export type InteractiveRebaseStore = InteractiveRebaseStoreState & InteractiveRebaseStoreActions;

const INITIAL_STATE: InteractiveRebaseStoreState = {
  isOpen: false,
  repositoryId: null,
  onto: '',
  entries: [],
  pendingAction: null,
  currentStep: 0,
  totalSteps: 0,
  status: 'idle',
  conflicts: [],
  error: null,
  isPublished: false,
  confirmedPublishedBranch: false,
  activeRequestId: null,
};

interface RebaseStateDetails {
  inProgress?: boolean;
  completedSteps?: number;
  totalSteps?: number;
  unmergedFiles?: string[];
}

function readRebaseStateDetails(payload: OperationResultPayload): RebaseStateDetails | undefined {
  const details = payload.error?.details;
  if (!details || typeof details !== 'object' || !('rebaseState' in details)) {
    return undefined;
  }
  const rebaseState = (details as { rebaseState?: unknown }).rebaseState;
  return rebaseState && typeof rebaseState === 'object'
    ? (rebaseState as RebaseStateDetails)
    : undefined;
}

export const useInteractiveRebaseStore = create<InteractiveRebaseStore>((set) => ({
  ...INITIAL_STATE,

  open: (options) =>
    set({
      ...INITIAL_STATE,
      isOpen: true,
      repositoryId: options.repositoryId,
      onto: options.onto,
      isPublished: options.isPublished,
      ...(options.upstream ? { upstream: options.upstream } : {}),
      pendingAction: options.initialAction ?? null,
      status: 'planning',
    }),

  close: () => set({ isOpen: false }),

  receivePlan: (entries, onto, error) => {
    set((state) => {
      const displayEntries = [...entries].reverse();
      const pending = state.pendingAction;
      if (pending) {
        const index = displayEntries.findIndex((entry) => entry.sha === pending.sha);
        if (index >= 0) {
          const target = displayEntries[index]!;
          displayEntries[index] = {
            ...target,
            action: pending.action,
            ...(pending.action === 'reword'
              ? { message: pending.message?.trim() ? pending.message : target.subject }
              : {}),
          };
        }
      }

      return {
        entries: displayEntries,
        onto,
        pendingAction: null,
        totalSteps: displayEntries.length,
        currentStep: 0,
        status: error ? 'failed' : 'ready',
        error: error ?? null,
        conflicts: [],
        activeRequestId: null,
      };
    });
  },

  reorder: (fromIndex, toIndex) =>
    set((state) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.entries.length ||
        toIndex >= state.entries.length
      ) {
        return state;
      }
      const entries = [...state.entries];
      const [moved] = entries.splice(fromIndex, 1);
      entries.splice(toIndex, 0, moved!);
      return { entries };
    }),

  setAction: (index, action) =>
    set((state) => {
      if (index < 0 || index >= state.entries.length) {
        return state;
      }
      const entries = [...state.entries];
      const entry = entries[index]!;
      entries[index] = {
        ...entry,
        action,
        ...(action === 'reword' && !entry.message?.trim() ? { message: entry.subject } : {}),
      };
      return { entries };
    }),

  setMessage: (index, message) =>
    set((state) => {
      if (index < 0 || index >= state.entries.length) {
        return state;
      }
      const entries = [...state.entries];
      entries[index] = { ...entries[index]!, message };
      return { entries };
    }),

  setConfirmedPublishedBranch: (confirmed) => set({ confirmedPublishedBranch: confirmed }),

  startRebase: (requestId) =>
    set((state) => ({
      status: 'running',
      activeRequestId: requestId ?? null,
      currentStep: state.entries.length > 0 ? 1 : 0,
      totalSteps: state.entries.length,
      conflicts: [],
      error: null,
    })),

  continueRebase: (requestId) =>
    set({
      status: 'running',
      activeRequestId: requestId ?? null,
      conflicts: [],
      error: null,
    }),

  abortRebase: (requestId) =>
    set({
      status: 'aborting',
      activeRequestId: requestId ?? null,
      conflicts: [],
      error: null,
    }),

  skipRebase: (requestId) =>
    set({
      status: 'running',
      activeRequestId: requestId ?? null,
      conflicts: [],
      error: null,
    }),

  receiveProgress: (payload) =>
    set((state) => {
      if (state.activeRequestId !== payload.requestId || state.totalSteps === 0) {
        return state;
      }
      const step = Math.min(
        state.totalSteps,
        Math.max(1, Math.ceil(payload.progress * state.totalSteps)),
      );
      return { currentStep: step };
    }),

  receiveResult: (payload) =>
    set((state) => {
      if (!state.activeRequestId || state.activeRequestId !== payload.requestId) {
        return state;
      }

      if (payload.success) {
        const data = payload.data as
          { action?: string; rebaseState?: RebaseStateDetails } | undefined;
        const rebaseState = data?.rebaseState;
        const action = data?.action;
        if (rebaseState?.inProgress) {
          return {
            status: 'paused',
            currentStep: rebaseState.completedSteps ?? state.currentStep,
            totalSteps: rebaseState.totalSteps ?? state.totalSteps,
            activeRequestId: null,
          };
        }
        return {
          status: action === 'abort' ? 'aborted' : 'completed',
          currentStep: state.totalSteps,
          activeRequestId: null,
        };
      }

      const rebaseState = readRebaseStateDetails(payload);
      if (rebaseState?.inProgress) {
        return {
          status: 'conflict',
          conflicts: rebaseState.unmergedFiles ?? [],
          currentStep: rebaseState.completedSteps ?? state.currentStep,
          totalSteps: rebaseState.totalSteps ?? state.totalSteps,
          error: payload.error?.message ?? 'Interactive rebase stopped with conflicts.',
          activeRequestId: null,
        };
      }

      return {
        status: 'failed',
        error: payload.error?.message ?? 'Interactive rebase failed.',
        activeRequestId: null,
      };
    }),

  reset: () => set(INITIAL_STATE),
}));
