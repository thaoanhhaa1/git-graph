/**
 * Represents a single active lane tracking an expected parent commit SHA
 * and carrying a persistent lineage color index.
 */
export interface ActiveLane {
  readonly lane: number;
  readonly targetSha: string;
  readonly colorIndex: number;
}

/**
 * Snapshot of all active lanes and color allocation state at any point during graph traversal.
 */
export interface LaneState {
  readonly activeLanes: ReadonlyArray<ActiveLane | null>;
  readonly maxLane: number;
  readonly nextColorIndex: number;
}

/**
 * Creates a clean initial lane state with no active lanes.
 */
export function createInitialLaneState(startColorIndex = 0): LaneState {
  return {
    activeLanes: [],
    maxLane: 0,
    nextColorIndex: Math.max(0, startColorIndex),
  };
}

/**
 * Clones a LaneState object immutably.
 */
export function cloneLaneState(state: LaneState): LaneState {
  return {
    activeLanes: state.activeLanes.map((lane) => (lane ? { ...lane } : null)),
    maxLane: state.maxLane,
    nextColorIndex: state.nextColorIndex,
  };
}

/**
 * Finds the first active lane tracking the given target commit SHA.
 */
export function findActiveLaneBySha(state: LaneState, sha: string): ActiveLane | undefined {
  for (const lane of state.activeLanes) {
    if (lane && lane.targetSha === sha) {
      return lane;
    }
  }
  return undefined;
}

/**
 * Finds the lane index tracking the given target commit SHA.
 * Returns -1 if not found.
 */
export function findLaneIndexBySha(state: LaneState, sha: string): number {
  for (let i = 0; i < state.activeLanes.length; i++) {
    const lane = state.activeLanes[i];
    if (lane && lane.targetSha === sha) {
      return i;
    }
  }
  return -1;
}

/**
 * Finds the first available (null/empty) lane index, or the end of the array if none are free.
 */
export function findFirstAvailableLaneIndex(state: LaneState): number {
  for (let i = 0; i < state.activeLanes.length; i++) {
    if (state.activeLanes[i] === null) {
      return i;
    }
  }
  return state.activeLanes.length;
}

/**
 * Sets a lane at the specified index with a target SHA.
 * If colorIndex is not provided, assigns the current nextColorIndex and increments it.
 */
export function setLane(
  state: LaneState,
  laneIndex: number,
  targetSha: string,
  colorIndex?: number,
): LaneState {
  if (laneIndex < 0) {
    throw new Error(`Lane index cannot be negative: ${laneIndex}`);
  }

  const newLanes: (ActiveLane | null)[] = [...state.activeLanes];
  while (newLanes.length <= laneIndex) {
    newLanes.push(null);
  }

  const assignedColor = colorIndex !== undefined ? colorIndex : state.nextColorIndex;
  const nextColorIndex =
    colorIndex !== undefined
      ? Math.max(state.nextColorIndex, colorIndex + 1)
      : state.nextColorIndex + 1;

  newLanes[laneIndex] = {
    lane: laneIndex,
    targetSha,
    colorIndex: assignedColor,
  };

  const calculatedMaxLane = Math.max(state.maxLane, laneIndex);

  return {
    activeLanes: newLanes,
    maxLane: calculatedMaxLane,
    nextColorIndex,
  };
}

/**
 * Clears (releases) the lane at the given index.
 */
export function clearLane(state: LaneState, laneIndex: number): LaneState {
  if (laneIndex < 0 || laneIndex >= state.activeLanes.length) {
    return state;
  }

  if (state.activeLanes[laneIndex] === null) {
    return state;
  }

  const newLanes = [...state.activeLanes];
  newLanes[laneIndex] = null;

  return {
    ...state,
    activeLanes: newLanes,
  };
}

/**
 * Compacts trailing null lanes from the end of the lane array.
 */
export function compactLaneState(state: LaneState): LaneState {
  let lastOccupiedIndex = -1;
  for (let i = state.activeLanes.length - 1; i >= 0; i--) {
    const lane = state.activeLanes[i];
    if (lane !== null && lane !== undefined) {
      lastOccupiedIndex = i;
      break;
    }
  }

  const newLanes = lastOccupiedIndex >= 0 ? state.activeLanes.slice(0, lastOccupiedIndex + 1) : [];
  const maxLane = Math.max(0, lastOccupiedIndex);

  return {
    ...state,
    activeLanes: newLanes,
    maxLane,
  };
}

/**
 * Returns all non-null active lanes.
 */
export function getActiveLanes(state: LaneState): ActiveLane[] {
  return state.activeLanes.filter(
    (lane): lane is ActiveLane => lane !== null && lane !== undefined,
  );
}

/**
 * Returns the count of active (non-null) lanes.
 */
export function countActiveLanes(state: LaneState): number {
  return state.activeLanes.filter((lane) => lane !== null && lane !== undefined).length;
}
