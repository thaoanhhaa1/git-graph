import type { GitRef } from '@git-graph/shared';
import type { LaneState } from './LaneState';

/**
 * State retained at a page boundary to allow seamless continuation of lanes,
 * colors, and unconsumed refs in subsequent pages without graph jumping.
 */
export interface GraphContinuation {
  readonly laneState: LaneState;
  readonly nextRowIndex: number;
  /**
   * Refs whose target commits have not yet appeared in any rendered page so far.
   * Carried over to subsequent pages so they can be attached when their target commits are loaded.
   */
  readonly externalRefs?: ReadonlyArray<GitRef>;
}

/**
 * Creates a valid immutable GraphContinuation snapshot.
 */
export function createGraphContinuation(
  laneState: LaneState,
  nextRowIndex = 0,
  externalRefs?: ReadonlyArray<GitRef>,
): GraphContinuation {
  return {
    laneState,
    nextRowIndex,
    ...(externalRefs && externalRefs.length > 0 ? { externalRefs } : {}),
  };
}

/**
 * Returns all unresolved parent SHAs currently being tracked in active lanes.
 */
export function getPendingParentShas(continuation: GraphContinuation): string[] {
  const shas: string[] = [];
  for (const lane of continuation.laneState.activeLanes) {
    if (lane && lane.targetSha && !shas.includes(lane.targetSha)) {
      shas.push(lane.targetSha);
    }
  }
  return shas;
}

/**
 * Checks if a specific parent SHA is waiting for resolution in the active continuation lanes.
 */
export function isParentPending(continuation: GraphContinuation, sha: string): boolean {
  return continuation.laneState.activeLanes.some((l) => l !== null && l.targetSha === sha);
}

/**
 * Returns true if there are any active lanes still expecting parent commits.
 */
export function hasPendingLanes(continuation: GraphContinuation): boolean {
  return continuation.laneState.activeLanes.some((l) => l !== null);
}

/**
 * Returns unconsumed external refs carried over in the continuation.
 */
export function getUnconsumedRefs(continuation: GraphContinuation): ReadonlyArray<GitRef> {
  return continuation.externalRefs ?? [];
}
