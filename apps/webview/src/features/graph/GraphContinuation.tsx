import React, { useMemo } from 'react';
import type { GraphRow } from '@git-graph/git-graph';
import {
  DEFAULT_LANE_WIDTH,
  DEFAULT_PADDING,
  DEFAULT_STROKE_WIDTH,
  getLaneColor,
  getLaneX,
} from './graphGeometry';

export interface GraphContinuationProps {
  row: GraphRow;
}

/**
 * Renders the vertical continuation lines for each distinct target lane
 * passing through a commit row.
 */
export const GraphContinuation: React.FC<GraphContinuationProps> = React.memo(({ row }) => {
  const lanes = useMemo(() => {
    const seen = new Map<number, number>();
    for (const segment of row.segments) {
      if (!seen.has(segment.toLane)) {
        seen.set(segment.toLane, segment.colorIndex);
      }
    }
    return Array.from(seen.entries()).map(([lane, colorIndex]) => ({
      lane,
      x: getLaneX(lane, DEFAULT_LANE_WIDTH, DEFAULT_PADDING),
      color: getLaneColor(colorIndex),
    }));
  }, [row.segments]);

  return (
    <>
      {lanes.map(({ lane, x, color }) => (
        <line
          key={`detail-lane-${lane}`}
          x1={x}
          y1="0"
          x2={x}
          y2="100%"
          stroke={color}
          strokeWidth={DEFAULT_STROKE_WIDTH}
        />
      ))}
    </>
  );
});

GraphContinuation.displayName = 'GraphContinuation';
