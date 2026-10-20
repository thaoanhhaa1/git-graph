import React from 'react';
import { DEFAULT_NODE_RADIUS } from './graphGeometry';

export interface GraphNodeProps {
  cx: number;
  cy: number;
  r?: number;
  color: string;
  isHead?: boolean;
  isMerge?: boolean;
  isSelected?: boolean;
  isUncommitted?: boolean;
  className?: string;
  testId?: string;
}

export const GraphNode: React.FC<GraphNodeProps> = React.memo(
  ({
    cx,
    cy,
    r = DEFAULT_NODE_RADIUS,
    color,
    isHead = false,
    isMerge = false,
    isSelected = false,
    isUncommitted = false,
    className,
    testId,
  }) => {
    const effectiveRadius = isMerge ? r + 0.5 : r;

    if (isUncommitted) {
      return (
        <g className={`graph-node-group graph-node-uncommitted ${isSelected ? 'selected' : ''}`}>
          <circle
            cx={cx}
            cy={cy}
            r={effectiveRadius + 0.5}
            fill="var(--color-bg, #1e1e1e)"
            stroke="var(--color-fg-muted, #a0a0a0)"
            strokeWidth={2}
            className={`graph-node graph-node-uncommitted ${className ?? ''}`.trim()}
            data-testid={testId ?? 'graph-node-uncommitted'}
          />
        </g>
      );
    }

    return (
      <g className={`graph-node-group ${isSelected ? 'selected' : ''}`}>
        {/* Outer ring for HEAD commit */}
        {isHead && (
          <circle
            cx={cx}
            cy={cy}
            r={effectiveRadius + 2.5}
            stroke={color}
            strokeWidth={1.5}
            className="graph-node-ring"
            data-testid="graph-node-head-ring"
          />
        )}

        {/* Commit node circle with background contrast outline */}
        <circle
          cx={cx}
          cy={cy}
          r={effectiveRadius}
          fill={color}
          stroke="var(--color-bg, #1e1e1e)"
          strokeWidth={1.5}
          className={`graph-node ${isHead ? 'graph-node-head' : ''} ${isMerge ? 'graph-node-merge' : ''} ${className ?? ''}`.trim()}
          data-testid={testId ?? 'graph-node'}
        />
      </g>
    );
  },
);

GraphNode.displayName = 'GraphNode';
