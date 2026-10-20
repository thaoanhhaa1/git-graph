import type { GraphSegment } from '@git-graph/git-graph';

export const DEFAULT_LANE_WIDTH = 16;
export const DEFAULT_ROW_HEIGHT = 28;
export const DEFAULT_NODE_RADIUS = 4;
export const DEFAULT_STROKE_WIDTH = 2;
export const DEFAULT_PADDING = 12;
export const MIN_GRAPH_WIDTH = 40;

/**
 * Default color palette tuned for accessibility and high contrast on dark & light backgrounds.
 */
export const DEFAULT_GRAPH_COLORS: readonly string[] = [
  '#00b4d8', // Cyan/Blue
  '#d03592', // Magenta/Pink
  '#2ebd59', // Green
  '#fb8c00', // Orange
  '#8b5cf6', // Violet
  '#eab308', // Yellow
  '#ef4444', // Red
  '#06b6d4', // Teal
];

/**
 * Vivid palette for High Contrast mode with maximized luminance separation.
 */
export const HIGH_CONTRAST_GRAPH_COLORS: readonly string[] = [
  '#56b6c2', // Cyan
  '#98c379', // Light green
  '#e06c75', // Light red
  '#d19a66', // Orange
  '#c678dd', // Purple
  '#61afef', // Light blue
  '#ff79c6', // Pink
  '#e5c07b', // Yellow
];

/**
 * Resolves X coordinate for a lane center given lane index, lane width, and left padding.
 */
export function getLaneX(
  lane: number,
  laneWidth = DEFAULT_LANE_WIDTH,
  leftPadding = DEFAULT_PADDING,
): number {
  return leftPadding + Math.max(0, lane) * laneWidth;
}

/**
 * Resolves (cx, cy) coordinates for a commit node in the row's coordinate space.
 */
export function getNodeCoordinates(
  lane: number,
  rowHeight = DEFAULT_ROW_HEIGHT,
  laneWidth = DEFAULT_LANE_WIDTH,
  leftPadding = DEFAULT_PADDING,
): { cx: number; cy: number } {
  return {
    cx: getLaneX(lane, laneWidth, leftPadding),
    cy: rowHeight / 2,
  };
}

/**
 * Computes the total required width of the graph cell to accommodate all lanes without clipping.
 */
export function getGraphWidth(
  maxLane: number,
  laneWidth = DEFAULT_LANE_WIDTH,
  leftPadding = DEFAULT_PADDING,
  rightPadding = DEFAULT_PADDING,
): number {
  const effectiveMax = Math.max(0, maxLane);
  const calculatedWidth = getLaneX(effectiveMax, laneWidth, leftPadding) + rightPadding;
  return Math.max(MIN_GRAPH_WIDTH, calculatedWidth);
}

/**
 * Normalizes a color index into the palette range [0..7].
 */
export function normalizePaletteIndex(colorIndex: number, paletteSize = 8): number {
  if (paletteSize <= 0) return 0;
  return ((colorIndex % paletteSize) + paletteSize) % paletteSize;
}

/**
 * Returns a CSS variable reference with fallback hex for the lane color.
 */
export function getLaneColor(
  colorIndex: number,
  palette: readonly string[] = DEFAULT_GRAPH_COLORS,
): string {
  const idx = normalizePaletteIndex(colorIndex, palette.length);
  const fallback = palette[idx] ?? DEFAULT_GRAPH_COLORS[0]!;
  return `var(--git-graph-color-${idx}, ${fallback})`;
}

/**
 * Creates an SVG path string for a straight vertical line.
 */
export function createStraightPath(x: number, y1: number, y2: number): string {
  return `M ${x} ${y1} L ${x} ${y2}`;
}

/**
 * Creates an SVG path string for a smooth cubic bezier curve.
 * Endpoints have vertical tangents to seamlessly join vertical row lines.
 */
export function createCurvePath(x1: number, y1: number, x2: number, y2: number): string {
  const dy = y2 - y1;
  const c1y = y1 + dy * 0.5;
  const c2y = y2 - dy * 0.5;
  return `M ${x1} ${y1} C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`;
}

/**
 * Generates an SVG path string for any GraphSegment inside a row cell.
 */
export function createSegmentPath(
  segment: GraphSegment,
  rowHeight = DEFAULT_ROW_HEIGHT,
  laneWidth = DEFAULT_LANE_WIDTH,
  leftPadding = DEFAULT_PADDING,
): string {
  const cy = rowHeight / 2;

  switch (segment.kind) {
    case 'pass-through': {
      const x = getLaneX(segment.fromLane, laneWidth, leftPadding);
      return createStraightPath(x, 0, rowHeight);
    }
    case 'straight': {
      const x = getLaneX(segment.fromLane, laneWidth, leftPadding);
      return createStraightPath(x, cy, rowHeight);
    }
    case 'branch':
    case 'merge': {
      const x1 = getLaneX(segment.fromLane, laneWidth, leftPadding);
      const x2 = getLaneX(segment.toLane, laneWidth, leftPadding);
      return createCurvePath(x1, cy, x2, rowHeight);
    }
  }
}

/**
 * Generates an incoming vertical connection from the top of the cell (y = 0)
 * down to the commit node (y = cy).
 */
export function createIncomingSegmentPath(
  lane: number,
  rowHeight = DEFAULT_ROW_HEIGHT,
  laneWidth = DEFAULT_LANE_WIDTH,
  leftPadding = DEFAULT_PADDING,
): string {
  const x = getLaneX(lane, laneWidth, leftPadding);
  const cy = rowHeight / 2;
  return createStraightPath(x, 0, cy);
}
