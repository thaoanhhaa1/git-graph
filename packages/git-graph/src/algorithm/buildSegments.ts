import type { Commit, GitRef } from '@git-graph/shared';
import {
  type GraphSegment,
  createStraightSegment,
  createBranchSegment,
  createMergeSegment,
  createPassThroughSegment,
} from '../model/GraphSegment';
import type { ActiveLane } from '../model/LaneState';

export const DEFAULT_PALETTE_SIZE = 8;

/**
 * Normalizes a color index against a palette size.
 * Handles negative indices and wraps around deterministically.
 */
export function normalizeColorIndex(
  colorIndex: number,
  paletteSize = DEFAULT_PALETTE_SIZE,
): number {
  if (paletteSize <= 0) return 0;
  return ((colorIndex % paletteSize) + paletteSize) % paletteSize;
}

export interface BuildSegmentOptions {
  readonly isBoundary?: boolean;
  readonly paletteSize?: number;
}

/**
 * Builds a straight segment connecting the same lane across rows.
 */
export function buildStraightSegment(
  fromRow: number,
  toRow: number,
  lane: number,
  colorIndex: number,
  options?: BuildSegmentOptions,
): GraphSegment {
  const normalizedColor =
    options?.paletteSize !== undefined
      ? normalizeColorIndex(colorIndex, options.paletteSize)
      : colorIndex;
  return createStraightSegment(fromRow, toRow, lane, normalizedColor, options?.isBoundary ?? false);
}

/**
 * Builds a branch segment branching out from a commit to a parent in another lane.
 */
export function buildBranchSegment(
  fromRow: number,
  fromLane: number,
  toRow: number,
  toLane: number,
  colorIndex: number,
  options?: BuildSegmentOptions,
): GraphSegment {
  const normalizedColor =
    options?.paletteSize !== undefined
      ? normalizeColorIndex(colorIndex, options.paletteSize)
      : colorIndex;
  return createBranchSegment(
    fromRow,
    fromLane,
    toRow,
    toLane,
    normalizedColor,
    options?.isBoundary ?? false,
  );
}

/**
 * Builds a merge segment merging a branch lane into a target parent lane.
 */
export function buildMergeSegment(
  fromRow: number,
  fromLane: number,
  toRow: number,
  toLane: number,
  colorIndex: number,
  options?: BuildSegmentOptions,
): GraphSegment {
  const normalizedColor =
    options?.paletteSize !== undefined
      ? normalizeColorIndex(colorIndex, options.paletteSize)
      : colorIndex;
  return createMergeSegment(
    fromRow,
    fromLane,
    toRow,
    toLane,
    normalizedColor,
    options?.isBoundary ?? false,
  );
}

/**
 * Builds a pass-through segment for an active lane passing through a row.
 */
export function buildPassThroughSegment(
  fromRow: number,
  toRow: number,
  lane: number,
  colorIndex: number,
  options?: BuildSegmentOptions,
): GraphSegment {
  const normalizedColor =
    options?.paletteSize !== undefined
      ? normalizeColorIndex(colorIndex, options.paletteSize)
      : colorIndex;
  return createPassThroughSegment(
    fromRow,
    toRow,
    lane,
    normalizedColor,
    options?.isBoundary ?? false,
  );
}

/**
 * Generates pass-through segments for all active lanes excluding the current commit's lane.
 */
export function buildPassThroughSegments(
  activeLanes: ReadonlyArray<ActiveLane | null>,
  currentRow: number,
  commitLane: number,
  isBoundary = false,
  paletteSize?: number,
): GraphSegment[] {
  const segments: GraphSegment[] = [];

  for (const lane of activeLanes) {
    if (lane && lane.lane !== commitLane) {
      segments.push(
        buildPassThroughSegment(currentRow, currentRow + 1, lane.lane, lane.colorIndex, {
          isBoundary,
          paletteSize,
        }),
      );
    }
  }

  return segments;
}

/**
 * Pure function that matches external refs to commits in the current page.
 * Attaches matching refs to commits without mutating the input commit array or objects.
 * Returns the commits and the remaining unconsumed refs whose targets were outside the current page.
 */
export function matchAndAttachRefs(
  commits: ReadonlyArray<Commit>,
  externalRefs?: ReadonlyArray<GitRef>,
): { readonly commits: ReadonlyArray<Commit>; readonly unconsumedRefs: ReadonlyArray<GitRef> } {
  if (!externalRefs || externalRefs.length === 0) {
    return { commits, unconsumedRefs: [] };
  }

  const commitShaMap = new Set(commits.map((c) => c.sha));
  const refsBySha = new Map<string, GitRef[]>();
  const unconsumed: GitRef[] = [];

  for (const ref of externalRefs) {
    if (commitShaMap.has(ref.target)) {
      const existing = refsBySha.get(ref.target);
      if (existing) {
        existing.push(ref);
      } else {
        refsBySha.set(ref.target, [ref]);
      }
    } else {
      unconsumed.push(ref);
    }
  }

  if (refsBySha.size === 0) {
    return { commits, unconsumedRefs: externalRefs };
  }

  const updatedCommits = commits.map((commit) => {
    const additional = refsBySha.get(commit.sha);
    if (!additional || additional.length === 0) {
      return commit;
    }

    const existingNames = new Set(commit.refs.map((r) => r.fullName || r.name));
    const merged = [...commit.refs];
    for (const ref of additional) {
      const id = ref.fullName || ref.name;
      if (!existingNames.has(id)) {
        existingNames.add(id);
        merged.push(ref);
      }
    }

    return {
      ...commit,
      refs: merged,
    };
  });

  return {
    commits: updatedCommits,
    unconsumedRefs: unconsumed,
  };
}
