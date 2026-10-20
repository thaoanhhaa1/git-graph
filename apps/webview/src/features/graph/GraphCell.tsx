import React from 'react';
import type { GraphRow } from '@git-graph/git-graph';
import {
  DEFAULT_LANE_WIDTH,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_PADDING,
  getNodeCoordinates,
  getGraphWidth,
  getLaneColor,
  createSegmentPath,
  createIncomingSegmentPath,
} from './graphGeometry';
import { GraphPath } from './GraphPath';
import { GraphNode } from './GraphNode';

export interface GraphCellProps {
  row: GraphRow;
  previousRow?: GraphRow;
  rowHeight?: number;
  laneWidth?: number;
  leftPadding?: number;
  maxGraphLane?: number;
  isHead?: boolean;
  isSelected?: boolean;
  isUncommitted?: boolean;
  className?: string;
}

export const GraphCell: React.FC<GraphCellProps> = React.memo(
  ({
    row,
    previousRow,
    rowHeight = DEFAULT_ROW_HEIGHT,
    laneWidth = DEFAULT_LANE_WIDTH,
    leftPadding = DEFAULT_PADDING,
    maxGraphLane,
    isHead = false,
    isSelected = false,
    isUncommitted = false,
    className,
  }) => {
    const effectiveMaxLane = Math.max(row.maxLane, maxGraphLane ?? 0);
    const width = getGraphWidth(effectiveMaxLane, laneWidth, leftPadding);
    const { cx, cy } = getNodeCoordinates(row.lane, rowHeight, laneWidth, leftPadding);

    // Identify node color from first outgoing non-pass-through segment or fallback to commit lane
    const nodeSegment = row.segments.find(
      (s) => s.fromLane === row.lane && s.kind !== 'pass-through',
    );
    const nodeColorIndex = nodeSegment ? nodeSegment.colorIndex : row.lane;
    const nodeColor = getLaneColor(nodeColorIndex);

    // Compute incoming connections arriving from previous row
    const incomingSegments = previousRow
      ? previousRow.segments.filter((s) => s.toRow === row.row && s.toLane === row.lane)
      : [];

    const shouldDrawFallbackIncoming = !previousRow && row.row > 0 && row.commit.parents.length > 0;

    const isMerge = row.commit.parents.length > 1;

    return (
      <svg
        className={`graph-cell-svg ${className ?? ''}`.trim()}
        width={width}
        height={rowHeight}
        viewBox={`0 0 ${width} ${rowHeight}`}
        role="presentation"
        aria-hidden="true"
        data-testid={`graph-cell-${row.commit.shortSha || row.commit.sha}`}
      >
        {/* 1. Outgoing and pass-through segments from current row */}
        {row.segments.map((segment, idx) => {
          const pathData = createSegmentPath(segment, rowHeight, laneWidth, leftPadding);
          const color =
            isUncommitted && segment.fromRow === row.row
              ? 'var(--color-fg-muted, #8b949e)'
              : getLaneColor(segment.colorIndex);
          const segKey = `${segment.kind}-${segment.fromRow}:${segment.fromLane}->${segment.toRow}:${segment.toLane}-${idx}`;

          return (
            <GraphPath
              key={segKey}
              d={pathData}
              color={color}
              isBoundary={Boolean(segment.isBoundary)}
              kind={segment.kind}
              testId={`graph-segment-${segment.kind}-${segment.fromLane}-${segment.toLane}`}
            />
          );
        })}

        {/* 2. Incoming connection(s) from previous row */}
        {incomingSegments.map((incSeg, idx) => {
          const pathData = createIncomingSegmentPath(row.lane, rowHeight, laneWidth, leftPadding);
          const isFromUncommitted =
            previousRow?.commit.shortSha === '*' || previousRow?.commit.sha === '*';
          const color = isFromUncommitted
            ? 'var(--color-fg-muted, #8b949e)'
            : getLaneColor(incSeg.colorIndex);
          return (
            <GraphPath
              key={`incoming-${incSeg.fromRow}-${idx}`}
              d={pathData}
              color={color}
              kind="incoming"
              testId={`graph-segment-incoming-${row.lane}`}
            />
          );
        })}

        {/* 3. Fallback incoming connection for isolated rows */}
        {shouldDrawFallbackIncoming && incomingSegments.length === 0 && (
          <GraphPath
            key="fallback-incoming"
            d={createIncomingSegmentPath(row.lane, rowHeight, laneWidth, leftPadding)}
            color={nodeColor}
            kind="incoming"
            testId={`graph-segment-incoming-${row.lane}`}
          />
        )}

        {/* 4. Commit Node Circle (rendered above segments) */}
        <GraphNode
          cx={cx}
          cy={cy}
          color={nodeColor}
          isHead={isHead}
          isMerge={isMerge}
          isSelected={isSelected}
          isUncommitted={isUncommitted}
          testId={`graph-node-${row.commit.shortSha || row.commit.sha}`}
        />
      </svg>
    );
  },
);

GraphCell.displayName = 'GraphCell';
