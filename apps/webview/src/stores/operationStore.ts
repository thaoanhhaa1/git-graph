import { create } from 'zustand';
import type {
  OperationProgressPayload,
  OperationResultPayload,
  ReflogEntry,
} from '@git-graph/shared';

export interface OperationStoreState {
  activeRequestId: string | null;
  progress: number;
  message: string | null;
  lastResult: OperationResultPayload | null;
  reflogEntries: ReflogEntry[];
}

export interface OperationStoreActions {
  startOperation: (requestId: string, message?: string) => void;
  updateProgress: (payload: OperationProgressPayload) => void;
  receiveResult: (payload: OperationResultPayload) => void;
  receiveReflog: (entries: ReflogEntry[]) => void;
  clearLastResult: () => void;
  reset: () => void;
}

export type OperationStore = OperationStoreState & OperationStoreActions;

export const useOperationStore = create<OperationStore>((set) => ({
  activeRequestId: null,
  progress: 0,
  message: null,
  lastResult: null,
  reflogEntries: [],

  startOperation: (requestId, message) => {
    set({
      activeRequestId: requestId,
      progress: 0,
      message: message ?? null,
      lastResult: null,
    });
  },

  updateProgress: (payload) => {
    set((state) => {
      if (state.activeRequestId && state.activeRequestId !== payload.requestId) {
        return state;
      }
      return {
        activeRequestId: payload.requestId,
        progress: payload.progress,
        message: payload.message ?? state.message,
      };
    });
  },

  receiveResult: (payload) => {
    set((state) => ({
      activeRequestId: state.activeRequestId === payload.requestId ? null : state.activeRequestId,
      progress: state.activeRequestId === payload.requestId ? 1 : state.progress,
      lastResult: payload,
    }));
  },

  receiveReflog: (entries) => set({ reflogEntries: entries }),

  clearLastResult: () => set({ lastResult: null, progress: 0, message: null }),

  reset: () =>
    set({
      activeRequestId: null,
      progress: 0,
      message: null,
      lastResult: null,
      reflogEntries: [],
    }),
}));
