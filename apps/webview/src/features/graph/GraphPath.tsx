import React from 'react';
import { DEFAULT_STROKE_WIDTH } from './graphGeometry';

export interface GraphPathProps {
  d: string;
  color: string;
  strokeWidth?: number;
  isBoundary?: boolean;
  kind?: string;
  className?: string;
  testId?: string;
}

export const GraphPath: React.FC<GraphPathProps> = React.memo(
  ({
    d,
    color,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    isBoundary = false,
    kind,
    className,
    testId,
  }) => {
    return (
      <path
        d={d}
        stroke={color}
        strokeWidth={strokeWidth}
        className={`graph-path ${isBoundary ? 'graph-path-boundary' : ''} ${className ?? ''}`.trim()}
        strokeDasharray={isBoundary ? '4 2' : undefined}
        opacity={isBoundary ? 0.75 : 1}
        data-segment-kind={kind}
        data-testid={testId}
      />
    );
  },
);

GraphPath.displayName = 'GraphPath';
