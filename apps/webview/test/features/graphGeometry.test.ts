import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LANE_WIDTH,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_PADDING,
  MIN_GRAPH_WIDTH,
  DEFAULT_GRAPH_COLORS,
  HIGH_CONTRAST_GRAPH_COLORS,
  getLaneX,
  getNodeCoordinates,
  getGraphWidth,
  normalizePaletteIndex,
  getLaneColor,
  createStraightPath,
  createCurvePath,
  createSegmentPath,
  createIncomingSegmentPath,
} from '../../src/features/graph/graphGeometry';
import type { GraphSegment } from '@git-graph/git-graph';

describe('graphGeometry pure functions', () => {
  it('exports default geometry constants', () => {
    expect(DEFAULT_LANE_WIDTH).toBe(16);
    expect(DEFAULT_ROW_HEIGHT).toBe(28);
    expect(DEFAULT_PADDING).toBe(12);
  });

  describe('getLaneX', () => {
    it('calculates lane center X with default padding and width', () => {
      expect(getLaneX(0)).toBe(12);
      expect(getLaneX(1)).toBe(28);
      expect(getLaneX(2)).toBe(44);
      expect(getLaneX(3)).toBe(60);
    });

    it('clamps negative lane to 0', () => {
      expect(getLaneX(-1)).toBe(12);
    });

    it('supports custom laneWidth and leftPadding', () => {
      expect(getLaneX(2, 20, 10)).toBe(50);
    });
  });

  describe('getNodeCoordinates', () => {
    it('returns cx and cy centered on rowHeight', () => {
      const coords = getNodeCoordinates(0, 28, 16, 12);
      expect(coords.cx).toBe(12);
      expect(coords.cy).toBe(14);

      const lane2Coords = getNodeCoordinates(2, 30, 20, 10);
      expect(lane2Coords.cx).toBe(50);
      expect(lane2Coords.cy).toBe(15);
    });
  });

  describe('getGraphWidth', () => {
    it('returns at least MIN_GRAPH_WIDTH for 0 or 1 lane', () => {
      expect(getGraphWidth(0)).toBe(MIN_GRAPH_WIDTH);
      expect(getGraphWidth(1)).toBe(MIN_GRAPH_WIDTH);
    });

    it('expands horizontally when multiple lanes are present', () => {
      const w2 = getGraphWidth(2);
      const w4 = getGraphWidth(4);
      const w8 = getGraphWidth(8);

      expect(w4).toBeGreaterThan(w2);
      expect(w8).toBeGreaterThan(w4);
      // Lane 4: 12 + 4 * 16 + 12 = 88px
      expect(w4).toBe(88);
    });
  });

  describe('normalizePaletteIndex and getLaneColor', () => {
    it('normalizes negative and wrapping color indices', () => {
      expect(normalizePaletteIndex(0)).toBe(0);
      expect(normalizePaletteIndex(7)).toBe(7);
      expect(normalizePaletteIndex(8)).toBe(0);
      expect(normalizePaletteIndex(9)).toBe(1);
      expect(normalizePaletteIndex(-1)).toBe(7);
      expect(normalizePaletteIndex(-8)).toBe(0);
    });

    it('generates CSS variable references with fallback hex colors', () => {
      const color0 = getLaneColor(0);
      expect(color0).toBe(`var(--git-graph-color-0, ${DEFAULT_GRAPH_COLORS[0]})`);

      const color3 = getLaneColor(3);
      expect(color3).toBe(`var(--git-graph-color-3, ${DEFAULT_GRAPH_COLORS[3]})`);

      // Wraparound
      const color8 = getLaneColor(8);
      expect(color8).toBe(`var(--git-graph-color-0, ${DEFAULT_GRAPH_COLORS[0]})`);
    });

    it('supports custom high-contrast palette', () => {
      const hcColor1 = getLaneColor(1, HIGH_CONTRAST_GRAPH_COLORS);
      expect(hcColor1).toBe(`var(--git-graph-color-1, ${HIGH_CONTRAST_GRAPH_COLORS[1]})`);
    });
  });

  describe('SVG path generation', () => {
    it('createStraightPath generates standard M ... L ... commands', () => {
      expect(createStraightPath(12, 0, 28)).toBe('M 12 0 L 12 28');
    });

    it('createCurvePath generates cubic bezier curve with vertical tangents', () => {
      const path = createCurvePath(12, 14, 28, 28);
      expect(path).toBe('M 12 14 C 12 21, 28 21, 28 28');
    });

    it('createSegmentPath for pass-through segment spans full row height', () => {
      const seg: GraphSegment = {
        fromRow: 1,
        fromLane: 1,
        toRow: 2,
        toLane: 1,
        kind: 'pass-through',
        colorIndex: 1,
      };
      const path = createSegmentPath(seg, 28, 16, 12);
      expect(path).toBe('M 28 0 L 28 28');
    });

    it('createSegmentPath for straight segment originates at commit node (cy)', () => {
      const seg: GraphSegment = {
        fromRow: 0,
        fromLane: 0,
        toRow: 1,
        toLane: 0,
        kind: 'straight',
        colorIndex: 0,
      };
      const path = createSegmentPath(seg, 28, 16, 12);
      expect(path).toBe('M 12 14 L 12 28');
    });

    it('createSegmentPath for branch segment creates smooth curve to child lane', () => {
      const seg: GraphSegment = {
        fromRow: 0,
        fromLane: 0,
        toRow: 1,
        toLane: 1,
        kind: 'branch',
        colorIndex: 1,
      };
      const path = createSegmentPath(seg, 28, 16, 12);
      expect(path).toBe('M 12 14 C 12 21, 28 21, 28 28');
    });

    it('createSegmentPath for merge segment creates smooth curve into target lane', () => {
      const seg: GraphSegment = {
        fromRow: 2,
        fromLane: 1,
        toRow: 3,
        toLane: 0,
        kind: 'merge',
        colorIndex: 1,
      };
      const path = createSegmentPath(seg, 28, 16, 12);
      expect(path).toBe('M 28 14 C 28 21, 12 21, 12 28');
    });

    it('createIncomingSegmentPath creates line from top edge to node center', () => {
      const path = createIncomingSegmentPath(0, 28, 16, 12);
      expect(path).toBe('M 12 0 L 12 14');
    });
  });
});
