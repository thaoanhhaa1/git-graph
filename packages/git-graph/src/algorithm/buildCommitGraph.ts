import type { Commit, GitRef } from '@git-graph/shared';
import { type GraphRow, createGraphRow } from '../model/GraphRow';
import type { LaneState } from '../model/LaneState';
import { type GraphContinuation } from '../model/GraphContinuation';
import { LaneAllocator } from './LaneAllocator';
import { matchAndAttachRefs } from './buildSegments';

export interface BuildCommitGraphOptions {
  readonly continuation?: GraphContinuation | LaneState;
  readonly startRow?: number;
  readonly totalPageRows?: number;
  /**
   * Additional external refs (e.g. from repository-wide queries) to match against commits.
   * Any refs whose targets are outside the current page are preserved in the continuation.
   */
  readonly externalRefs?: ReadonlyArray<GitRef>;
  /**
   * Constrains segment color indices to [0, paletteSize - 1].
   */
  readonly paletteSize?: number;
}

/**
 * Result returned by buildCommitGraph.
 * Extends ReadonlyArray<GraphRow> so it can be used directly wherever an array of rows is expected,
 * while also exposing continuation metadata and rows property.
 */
export interface CommitGraphResult extends ReadonlyArray<GraphRow> {
  readonly rows: ReadonlyArray<GraphRow>;
  readonly continuation: GraphContinuation;
}

/**
 * Pure function that builds a topologically consistent commit graph from an ordered list of commits.
 * Commits must be provided in topological / date order (children before parents).
 *
 * @param commits Ordered list of Git commits.
 * @param optionsOrContinuation Optional continuation state or graph options for pagination.
 */
export function buildCommitGraph(
  commits: ReadonlyArray<Commit>,
  optionsOrContinuation?: BuildCommitGraphOptions | GraphContinuation | LaneState,
): CommitGraphResult {
  let initialContinuation: GraphContinuation | LaneState | undefined;
  let startRow = 0;
  let totalPageRows = commits.length;
  let incomingExternalRefs: ReadonlyArray<GitRef> | undefined;
  let paletteSize: number | undefined;

  if (optionsOrContinuation) {
    if ('laneState' in optionsOrContinuation) {
      initialContinuation = optionsOrContinuation;
      startRow = optionsOrContinuation.nextRowIndex;
      totalPageRows = startRow + commits.length;
      incomingExternalRefs = optionsOrContinuation.externalRefs;
    } else if ('activeLanes' in optionsOrContinuation) {
      initialContinuation = optionsOrContinuation;
    } else {
      initialContinuation = optionsOrContinuation.continuation;
      startRow = optionsOrContinuation.startRow ?? 0;
      totalPageRows = optionsOrContinuation.totalPageRows ?? startRow + commits.length;
      paletteSize = optionsOrContinuation.paletteSize;

      const contRefs =
        initialContinuation && 'externalRefs' in initialContinuation
          ? initialContinuation.externalRefs
          : undefined;

      if (optionsOrContinuation.externalRefs || contRefs) {
        incomingExternalRefs = [...(contRefs ?? []), ...(optionsOrContinuation.externalRefs ?? [])];
      }
    }
  }

  // Purely attach matching external refs without mutating original commits array
  const { commits: pageCommits, unconsumedRefs } = matchAndAttachRefs(
    commits,
    incomingExternalRefs,
  );

  const allocator = new LaneAllocator(initialContinuation, { paletteSize });
  const rows: GraphRow[] = [];

  for (let i = 0; i < pageCommits.length; i++) {
    const commit = pageCommits[i]!;
    const currentRow = startRow + i;
    const isBoundary = currentRow + 1 >= totalPageRows;

    // 1. Find or allocate lane for current commit
    const commitLane = allocator.findOrAllocateCommitLane(commit.sha);

    // 2. Capture pass-through segments for active lanes
    const passThroughSegments = allocator.createPassThroughSegments(
      currentRow,
      commitLane.lane,
      isBoundary,
    );

    // 3. Clear current commit token
    allocator.clearCommitToken(commitLane.lane);

    // 4, 5, 6. Allocate parents (straight, branch, merge)
    const parentSegments = allocator.allocateParents(
      currentRow,
      commitLane.lane,
      commitLane.colorIndex,
      commit.parents,
      isBoundary,
    );

    // 7. Compact trailing null lanes
    allocator.compact();

    // 8. Construct row
    const rowSegments = [...passThroughSegments, ...parentSegments];
    const row = createGraphRow({
      commit,
      row: currentRow,
      lane: commitLane.lane,
      segments: rowSegments,
    });

    rows.push(row);
  }

  const continuation = allocator.getContinuation(startRow + commits.length, unconsumedRefs);

  // Return array with attached metadata properties
  const result = rows as unknown as CommitGraphResult;
  Object.defineProperty(result, 'rows', {
    value: rows,
    writable: false,
    enumerable: false,
  });
  Object.defineProperty(result, 'continuation', {
    value: continuation,
    writable: false,
    enumerable: false,
  });

  return result;
}
