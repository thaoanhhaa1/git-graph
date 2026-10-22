import { describe, it, expect, vi } from 'vitest';
import {
  computeMinimapMetrics,
  minimapYToScrollTop,
  drawMinimap,
} from '../../src/features/graph/minimapRenderer';

function createContext() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe('minimapRenderer', () => {
  it('maps the viewport into minimap coordinates', () => {
    const metrics = computeMinimapMetrics({
      totalRows: 1000,
      rowHeight: 24,
      viewportHeight: 480,
      scrollTop: 2400,
      width: 48,
      height: 500,
      maxLane: 3,
    });

    expect(metrics.totalContentHeight).toBe(24000);
    expect(metrics.rowScale).toBe(0.5);
    expect(metrics.viewportTop).toBeCloseTo(50, 5);
    expect(metrics.viewportRectHeight).toBeCloseTo(10, 5);
    expect(metrics.maxScrollTop).toBe(23520);
  });

  it('clamps the viewport indicator at the bottom of the minimap', () => {
    const metrics = computeMinimapMetrics({
      totalRows: 100,
      rowHeight: 24,
      viewportHeight: 240,
      scrollTop: 999999,
      width: 48,
      height: 240,
      maxLane: 0,
    });

    expect(metrics.viewportTop).toBeLessThanOrEqual(239);
    expect(metrics.viewportTop + metrics.viewportRectHeight).toBeLessThanOrEqual(241);
  });

  it('converts minimap Y coordinates to centered scrollTop values', () => {
    expect(minimapYToScrollTop(0, 500, 24000, 480)).toBe(0);
    expect(minimapYToScrollTop(250, 500, 24000, 480)).toBe(11760);
    expect(minimapYToScrollTop(500, 500, 24000, 480)).toBe(23520);
  });

  it('draws topology lines and commit dots without rendering text', () => {
    const context = createContext();
    const metrics = drawMinimap(
      context,
      {
        commits: [
          {
            graphRow: {
              commit: {
                sha: 'a',
                shortSha: 'a',
                parents: [],
                author: { name: 'A', email: 'a@x', timestamp: 1, timezone: '+0000' },
                committer: { name: 'A', email: 'a@x', timestamp: 1, timezone: '+0000' },
                subject: 'a',
                refs: [],
              },
              row: 0,
              lane: 0,
              maxLane: 0,
              segments: [
                { fromRow: 0, fromLane: 0, toRow: 0, toLane: 0, kind: 'straight', colorIndex: 0 },
              ],
            },
            isHead: true,
          },
        ],
        totalRows: 1,
        rowHeight: 24,
        viewportHeight: 480,
        scrollTop: 0,
        width: 48,
        height: 500,
        maxLane: 0,
      },
      { viewport: 'rgba(0,0,0,0.2)' },
    );

    expect(metrics.totalRows).toBe(1);
    expect(context.clearRect).toHaveBeenCalled();
    expect(context.stroke).toHaveBeenCalled();
    expect(context.arc).toHaveBeenCalledWith(24, 250, 2.5, 0, Math.PI * 2);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 48, 500);
  });

  it('skips drawing when there are no commits', () => {
    const context = createContext();
    drawMinimap(context, {
      commits: [],
      totalRows: 0,
      rowHeight: 24,
      viewportHeight: 480,
      scrollTop: 0,
      width: 48,
      height: 500,
      maxLane: 0,
    });

    expect(context.stroke).not.toHaveBeenCalled();
    expect(context.arc).not.toHaveBeenCalled();
  });
});
