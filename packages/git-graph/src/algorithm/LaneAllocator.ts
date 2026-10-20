import type { GitRef } from '@git-graph/shared';
import {
  type ActiveLane,
  type LaneState,
  createInitialLaneState,
  cloneLaneState,
  findFirstAvailableLaneIndex,
  compactLaneState,
} from '../model/LaneState';
import type { GraphSegment } from '../model/GraphSegment';
import { type GraphContinuation, createGraphContinuation } from '../model/GraphContinuation';
import {
  buildPassThroughSegments,
  buildStraightSegment,
  buildBranchSegment,
  buildMergeSegment,
} from './buildSegments';

export interface CommitLaneAllocation {
  readonly lane: number;
  readonly colorIndex: number;
}

export interface LaneAllocatorOptions {
  readonly paletteSize?: number;
}

/**
 * Stateful allocator managing lane assignments, color lineage, and segment generation
 * for each row in the commit graph.
 */
export class LaneAllocator {
  private state: LaneState;
  private readonly paletteSize?: number;

  constructor(
    initialStateOrContinuation?: LaneState | GraphContinuation,
    options?: LaneAllocatorOptions,
  ) {
    if (!initialStateOrContinuation) {
      this.state = createInitialLaneState(0);
    } else if ('laneState' in initialStateOrContinuation) {
      this.state = cloneLaneState(initialStateOrContinuation.laneState);
    } else {
      this.state = cloneLaneState(initialStateOrContinuation);
    }
    this.paletteSize = options?.paletteSize;
  }

  /**
   * Returns current snapshot of the lane state.
   */
  public getState(): LaneState {
    return cloneLaneState(this.state);
  }

  /**
   * Returns a continuation object capturing the current active lane state
   * and the given next row index.
   */
  public getContinuation(
    nextRowIndex: number,
    externalRefs?: ReadonlyArray<GitRef>,
  ): GraphContinuation {
    return createGraphContinuation(this.getState(), nextRowIndex, externalRefs);
  }

  /**
   * Step 1: Locate the commit SHA in active lanes.
   * If already tracked, return that lane and its lineage color.
   * If not tracked, allocate a new lane index (first available free slot) and next color.
   */
  public findOrAllocateCommitLane(commitSha: string): CommitLaneAllocation {
    for (let i = 0; i < this.state.activeLanes.length; i++) {
      const active = this.state.activeLanes[i];
      if (active && active.targetSha === commitSha) {
        return {
          lane: active.lane,
          colorIndex: active.colorIndex,
        };
      }
    }

    // Not found in active lanes: allocate a new lane
    const allocatedLane = findFirstAvailableLaneIndex(this.state);
    const assignedColor = this.state.nextColorIndex;

    const newLanes: (ActiveLane | null)[] = [...this.state.activeLanes];
    while (newLanes.length <= allocatedLane) {
      newLanes.push(null);
    }

    newLanes[allocatedLane] = {
      lane: allocatedLane,
      targetSha: commitSha,
      colorIndex: assignedColor,
    };

    this.state = {
      activeLanes: newLanes,
      maxLane: Math.max(this.state.maxLane, allocatedLane),
      nextColorIndex: assignedColor + 1,
    };

    return {
      lane: allocatedLane,
      colorIndex: assignedColor,
    };
  }

  /**
   * Step 2: Capture active lanes before modification to generate pass-through segments.
   * Any active lane that is NOT the current commit lane passes through this row.
   */
  public createPassThroughSegments(
    currentRow: number,
    commitLane: number,
    isBoundary: boolean,
  ): GraphSegment[] {
    return buildPassThroughSegments(
      this.state.activeLanes,
      currentRow,
      commitLane,
      isBoundary,
      this.paletteSize,
    );
  }

  /**
   * Step 3: Remove the current commit token from active lanes.
   */
  public clearCommitToken(commitLane: number): void {
    if (commitLane < 0 || commitLane >= this.state.activeLanes.length) {
      return;
    }

    const newLanes = [...this.state.activeLanes];
    newLanes[commitLane] = null;

    this.state = {
      ...this.state,
      activeLanes: newLanes,
    };
  }

  /**
   * Steps 4, 5, 6: Allocate parent commits into lanes and generate connecting segments.
   *
   * 4. Place first parent into the current commit lane when possible to keep mainline straight.
   * 5. Place remaining parents into available/nearest lanes deterministically (branching).
   * 6. If a parent is already tracked in an active lane, create a merge segment instead of duplicating.
   */
  public allocateParents(
    currentRow: number,
    commitLane: number,
    commitColor: number,
    parents: ReadonlyArray<string>,
    isBoundary: boolean,
  ): GraphSegment[] {
    if (parents.length === 0) {
      return [];
    }

    const segments: GraphSegment[] = [];
    const newLanes: (ActiveLane | null)[] = [...this.state.activeLanes];

    const findExistingLaneIndex = (sha: string): number => {
      for (let i = 0; i < newLanes.length; i++) {
        const lane = newLanes[i];
        if (lane && lane.targetSha === sha) {
          return i;
        }
      }
      return -1;
    };

    const findFirstFreeIndex = (excludeLane?: number): number => {
      let idx = 0;
      while (true) {
        if (idx !== excludeLane) {
          if (idx >= newLanes.length || newLanes[idx] === null) {
            return idx;
          }
        }
        idx++;
      }
    };

    let nextColor = this.state.nextColorIndex;

    // Step 4 & 6: First parent
    const firstParentSha = parents[0]!;
    const existingFirstParentLane = findExistingLaneIndex(firstParentSha);

    if (existingFirstParentLane !== -1) {
      // First parent already exists in another lane -> create merge segment
      const targetLane = newLanes[existingFirstParentLane]!;
      const mergeColor = commitLane > existingFirstParentLane ? commitColor : targetLane.colorIndex;
      segments.push(
        buildMergeSegment(
          currentRow,
          commitLane,
          currentRow + 1,
          existingFirstParentLane,
          mergeColor,
          {
            isBoundary,
            paletteSize: this.paletteSize,
          },
        ),
      );
    } else {
      // First parent not tracked yet: place into commitLane to keep mainline straight
      while (newLanes.length <= commitLane) {
        newLanes.push(null);
      }
      newLanes[commitLane] = {
        lane: commitLane,
        targetSha: firstParentSha,
        colorIndex: commitColor,
      };
      segments.push(
        buildStraightSegment(currentRow, currentRow + 1, commitLane, commitColor, {
          isBoundary,
          paletteSize: this.paletteSize,
        }),
      );
    }

    // Step 5 & 6: Remaining parents
    for (let i = 1; i < parents.length; i++) {
      const parentSha = parents[i]!;
      const existingLane = findExistingLaneIndex(parentSha);

      if (existingLane !== -1) {
        // Parent already tracked in another active lane -> create merge segment
        const target = newLanes[existingLane]!;
        const mergeColor = commitLane > existingLane ? commitColor : target.colorIndex;
        segments.push(
          buildMergeSegment(currentRow, commitLane, currentRow + 1, existingLane, mergeColor, {
            isBoundary,
            paletteSize: this.paletteSize,
          }),
        );
      } else {
        // Parent not tracked: allocate new lane
        const branchLane = findFirstFreeIndex(commitLane);
        const branchColor = nextColor++;

        while (newLanes.length <= branchLane) {
          newLanes.push(null);
        }

        newLanes[branchLane] = {
          lane: branchLane,
          targetSha: parentSha,
          colorIndex: branchColor,
        };

        segments.push(
          buildBranchSegment(currentRow, commitLane, currentRow + 1, branchLane, branchColor, {
            isBoundary,
            paletteSize: this.paletteSize,
          }),
        );
      }
    }

    let calculatedMax = this.state.maxLane;
    for (let i = 0; i < newLanes.length; i++) {
      if (newLanes[i] !== null && i > calculatedMax) {
        calculatedMax = i;
      }
    }

    this.state = {
      activeLanes: newLanes,
      maxLane: calculatedMax,
      nextColorIndex: nextColor,
    };

    return segments;
  }

  /**
   * Step 7: Compact trailing null lanes without changing meaning/indices of active lanes.
   */
  public compact(): void {
    this.state = compactLaneState(this.state);
  }
}
