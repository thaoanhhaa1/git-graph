import type { GraphRow } from '@git-graph/git-graph';
import { DEFAULT_GRAPH_COLORS, normalizePaletteIndex } from './graphGeometry';

export interface MinimapCommit {
  graphRow?: GraphRow;
  isHead?: boolean;
  refs?: ReadonlyArray<{ type?: string; kind?: string }>;
}

export interface MinimapMetricsInput {
  totalRows: number;
  rowHeight: number;
  viewportHeight: number;
  scrollTop: number;
  width: number;
  height: number;
  maxLane: number;
}

export interface MinimapMetrics {
  totalRows: number;
  totalContentHeight: number;
  rowScale: number;
  laneStep: number;
  offsetX: number;
  viewportTop: number;
  viewportRectHeight: number;
  maxScrollTop: number;
}

export interface MinimapDrawInput extends MinimapMetricsInput {
  commits: readonly MinimapCommit[];
}

const HORIZONTAL_PADDING = 4;
const MIN_VIEWPORT_RECT_HEIGHT = 5;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Computes the vertical and horizontal mapping used to paint the minimap.
 * Kept pure so the mapping and viewport indicator can be tested without a canvas.
 */
export function computeMinimapMetrics(input: MinimapMetricsInput): MinimapMetrics {
  const totalRows = Math.max(0, input.totalRows);
  const totalContentHeight = totalRows * Math.max(1, input.rowHeight);
  const height = Math.max(1, input.height);
  const width = Math.max(1, input.width);
  const rowScale = totalRows > 0 ? height / totalRows : 0;
  const laneCount = Math.max(1, input.maxLane + 1);
  const usableWidth = Math.max(1, width - HORIZONTAL_PADDING * 2);
  const laneStep = usableWidth / laneCount;
  const offsetX = HORIZONTAL_PADDING + laneStep / 2;
  const maxScrollTop = Math.max(0, totalContentHeight - input.viewportHeight);
  const viewportRectHeight =
    totalContentHeight > 0
      ? clamp(
          (input.viewportHeight / totalContentHeight) * height,
          MIN_VIEWPORT_RECT_HEIGHT,
          height,
        )
      : height;
  const viewportTop =
    totalContentHeight > 0
      ? clamp(
          (input.scrollTop / totalContentHeight) * height,
          0,
          Math.max(0, height - viewportRectHeight),
        )
      : 0;

  return {
    totalRows,
    totalContentHeight,
    rowScale,
    laneStep,
    offsetX,
    viewportTop,
    viewportRectHeight,
    maxScrollTop,
  };
}

/**
 * Converts a click/drag position on the minimap into a commit-list scrollTop.
 */
export function minimapYToScrollTop(
  y: number,
  height: number,
  totalContentHeight: number,
  viewportHeight: number,
): number {
  if (height <= 0 || totalContentHeight <= 0) {
    return 0;
  }
  const ratio = clamp(y / height, 0, 1);
  const centered = ratio * totalContentHeight - viewportHeight / 2;
  return clamp(centered, 0, Math.max(0, totalContentHeight - viewportHeight));
}

function resolveColor(index: number, colors: readonly string[]): string {
  const palette = colors.length > 0 ? colors : DEFAULT_GRAPH_COLORS;
  return palette[normalizePaletteIndex(index, palette.length)] ?? DEFAULT_GRAPH_COLORS[0]!;
}

export interface MinimapPaintOptions {
  background?: string;
  viewport?: string;
  viewportBorder?: string;
  headRing?: string;
}

/**
 * Paints the topology overview (lane lines + commit dots) and the viewport box.
 * Only strokes/dots are drawn — no text — so painting stays cheap for 10K+ rows.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  input: MinimapDrawInput,
  options: MinimapPaintOptions = {},
): MinimapMetrics {
  const metrics = computeMinimapMetrics({
    totalRows: input.totalRows,
    rowHeight: input.rowHeight,
    viewportHeight: input.viewportHeight,
    scrollTop: input.scrollTop,
    width: input.width,
    height: input.height,
    maxLane: input.maxLane,
  });

  const width = Math.max(1, input.width);
  const height = Math.max(1, input.height);

  ctx.clearRect(0, 0, width, height);

  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, width, height);
  }

  if (metrics.totalRows > 0) {
    const commits = input.commits;
    const count = Math.min(commits.length, metrics.totalRows);

    ctx.lineWidth = 1;
    for (let index = 0; index < count; index += 1) {
      const row = commits[index]?.graphRow;
      if (!row) continue;
      for (const segment of row.segments) {
        const x1 = metrics.offsetX + segment.fromLane * metrics.laneStep;
        const x2 = metrics.offsetX + segment.toLane * metrics.laneStep;
        const startRow = Math.max(index, segment.fromRow);
        const endRow = segment.toRow > startRow ? segment.toRow : Math.max(startRow + 1, index + 1);
        const y1 = startRow * metrics.rowScale;
        const y2 = Math.min(metrics.totalRows, endRow + 1) * metrics.rowScale;
        ctx.strokeStyle = resolveColor(segment.colorIndex, DEFAULT_GRAPH_COLORS);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    for (let index = 0; index < count; index += 1) {
      const commit = commits[index];
      const row = commit?.graphRow;
      if (!commit || !row) continue;
      const x = metrics.offsetX + row.lane * metrics.laneStep;
      const y = (index + 0.5) * metrics.rowScale;
      const hasTag = commit.refs?.some((ref) => (ref.kind ?? ref.type) === 'tag');
      const radius = commit.isHead ? 2.5 : hasTag ? 2.2 : 1.4;
      ctx.fillStyle = resolveColor(row.lane, DEFAULT_GRAPH_COLORS);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (commit.isHead && options.headRing) {
        ctx.strokeStyle = options.headRing;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, radius + 1.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  if (options.viewport) {
    ctx.fillStyle = options.viewport;
    ctx.fillRect(0, metrics.viewportTop, width, metrics.viewportRectHeight);
    if (options.viewportBorder) {
      ctx.strokeStyle = options.viewportBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, metrics.viewportTop + 0.5, width - 1, metrics.viewportRectHeight - 1);
    }
  }

  return metrics;
}
