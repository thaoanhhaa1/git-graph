// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Commit } from '@git-graph/shared';
import { buildCommitGraph, createGraphRow, createStraightSegment } from '@git-graph/git-graph';
import { GraphPath } from '../../src/features/graph/GraphPath';
import { GraphNode } from '../../src/features/graph/GraphNode';
import { GraphCell } from '../../src/features/graph/GraphCell';

function makeMockCommit(sha: string, parents: string[] = []): Commit {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    parents,
    author: {
      name: 'Tester',
      email: 'tester@example.com',
      timestamp: 1700000000,
      timezone: '+0000',
    },
    committer: {
      name: 'Tester',
      email: 'tester@example.com',
      timestamp: 1700000000,
      timezone: '+0000',
    },
    subject: `Commit ${sha}`,
    refs: [],
  };
}

describe('SVG Graph Components', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  describe('GraphPath', () => {
    it('renders an SVG path with stroke color, width and data attributes', async () => {
      const root = createRoot(container);
      await act(async () => {
        root.render(
          <svg>
            <GraphPath
              d="M 12 0 L 12 28"
              color="#007acc"
              strokeWidth={2}
              kind="straight"
              testId="test-straight-path"
            />
          </svg>,
        );
      });

      const path = container.querySelector('[data-testid="test-straight-path"]') as SVGPathElement;
      expect(path).toBeTruthy();
      expect(path.getAttribute('d')).toBe('M 12 0 L 12 28');
      expect(path.getAttribute('stroke')).toBe('#007acc');
      expect(path.getAttribute('stroke-width')).toBe('2');
      expect(path.getAttribute('data-segment-kind')).toBe('straight');
      expect(path.getAttribute('stroke-dasharray')).toBeNull();

      await act(async () => {
        root.unmount();
      });
    });

    it('renders dashed stroke and boundary class for boundary segments', async () => {
      const root = createRoot(container);
      await act(async () => {
        root.render(
          <svg>
            <GraphPath
              d="M 12 14 L 12 28"
              color="#28a745"
              isBoundary={true}
              testId="test-boundary-path"
            />
          </svg>,
        );
      });

      const path = container.querySelector('[data-testid="test-boundary-path"]') as SVGPathElement;
      expect(path).toBeTruthy();
      expect(path.getAttribute('stroke-dasharray')).toBe('4 2');
      expect(path.classList.contains('graph-path-boundary')).toBe(true);

      await act(async () => {
        root.unmount();
      });
    });
  });

  describe('GraphNode', () => {
    it('renders a circle at specified coordinates with color fill', async () => {
      const root = createRoot(container);
      await act(async () => {
        root.render(
          <svg>
            <GraphNode cx={12} cy={14} r={4} color="#007acc" testId="test-commit-node" />
          </svg>,
        );
      });

      const circle = container.querySelector(
        '[data-testid="test-commit-node"]',
      ) as SVGCircleElement;
      expect(circle).toBeTruthy();
      expect(circle.getAttribute('cx')).toBe('12');
      expect(circle.getAttribute('cy')).toBe('14');
      expect(circle.getAttribute('r')).toBe('4');
      expect(circle.getAttribute('fill')).toBe('#007acc');

      await act(async () => {
        root.unmount();
      });
    });

    it('renders an additional outer ring when isHead is true', async () => {
      const root = createRoot(container);
      await act(async () => {
        root.render(
          <svg>
            <GraphNode
              cx={12}
              cy={14}
              r={4}
              color="#007acc"
              isHead={true}
              testId="test-head-node"
            />
          </svg>,
        );
      });

      const headRing = container.querySelector(
        '[data-testid="graph-node-head-ring"]',
      ) as SVGCircleElement;
      expect(headRing).toBeTruthy();
      expect(headRing.getAttribute('cx')).toBe('12');
      expect(headRing.getAttribute('cy')).toBe('14');
      expect(headRing.getAttribute('stroke')).toBe('#007acc');

      const nodeCircle = container.querySelector(
        '[data-testid="test-head-node"]',
      ) as SVGCircleElement;
      expect(nodeCircle.classList.contains('graph-node-head')).toBe(true);

      await act(async () => {
        root.unmount();
      });
    });

    it('increases radius slightly for merge commits', async () => {
      const root = createRoot(container);
      await act(async () => {
        root.render(
          <svg>
            <GraphNode
              cx={12}
              cy={14}
              r={4}
              color="#e36209"
              isMerge={true}
              testId="test-merge-node"
            />
          </svg>,
        );
      });

      const circle = container.querySelector('[data-testid="test-merge-node"]') as SVGCircleElement;
      expect(circle).toBeTruthy();
      expect(circle.getAttribute('r')).toBe('4.5');
      expect(circle.classList.contains('graph-node-merge')).toBe(true);

      await act(async () => {
        root.unmount();
      });
    });
  });

  describe('GraphCell accessibility and layout', () => {
    it('renders svg with role="presentation", aria-hidden="true" and NO text elements', async () => {
      const commit = makeMockCommit('c1', ['c0']);
      const row = createGraphRow({
        commit,
        row: 0,
        lane: 0,
        segments: [createStraightSegment(0, 1, 0, 0)],
      });

      const root = createRoot(container);
      await act(async () => {
        root.render(<GraphCell row={row} />);
      });

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('role')).toBe('presentation');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');

      // Accessibility rule: metadata must be in HTML table DOM, NEVER inside SVG
      const svgTextElements = container.querySelectorAll('svg text');
      expect(svgTextElements.length).toBe(0);

      await act(async () => {
        root.unmount();
      });
    });

    it('connects incoming segment from previousRow into commit node', async () => {
      const commit0 = makeMockCommit('c0', []);
      const commit1 = makeMockCommit('c1', ['c0']);

      const prevRow = createGraphRow({
        commit: commit1,
        row: 0,
        lane: 0,
        segments: [createStraightSegment(0, 1, 0, 0)],
      });

      const currentRow = createGraphRow({
        commit: commit0,
        row: 1,
        lane: 0,
        segments: [],
      });

      const root = createRoot(container);
      await act(async () => {
        root.render(<GraphCell row={currentRow} previousRow={prevRow} />);
      });

      const incomingPath = container.querySelector(
        '[data-testid="graph-segment-incoming-0"]',
      ) as SVGPathElement;
      expect(incomingPath).toBeTruthy();
      expect(incomingPath.getAttribute('d')).toBe('M 12 0 L 12 14');

      await act(async () => {
        root.unmount();
      });
    });

    it('expands SVG width horizontally when maxGraphLane is high', async () => {
      const commit = makeMockCommit('c1', []);
      const row = createGraphRow({
        commit,
        row: 0,
        lane: 3,
        maxLane: 3,
        segments: [],
      });

      const root = createRoot(container);
      await act(async () => {
        root.render(<GraphCell row={row} maxGraphLane={5} />);
      });

      const svg = container.querySelector('svg') as SVGSVGElement;
      // Lane 5: 12 + 5 * 16 + 12 = 104px
      expect(parseInt(svg.getAttribute('width') || '0', 10)).toBe(104);

      await act(async () => {
        root.unmount();
      });
    });
  });

  describe('Visual Fixtures matching Graph Engine topologies', () => {
    it('Fixture 1: Linear chain renders straight connected segments', async () => {
      const commits = [
        makeMockCommit('c2', ['c1']),
        makeMockCommit('c1', ['c0']),
        makeMockCommit('c0', []),
      ];

      const graph = buildCommitGraph(commits);
      expect(graph).toHaveLength(3);

      const root = createRoot(container);
      await act(async () => {
        root.render(
          <div>
            <GraphCell row={graph[0]!} />
            <GraphCell row={graph[1]!} previousRow={graph[0]!} />
            <GraphCell row={graph[2]!} previousRow={graph[1]!} />
          </div>,
        );
      });

      const cells = container.querySelectorAll('.graph-cell-svg');
      expect(cells.length).toBe(3);

      // Row 0 has straight outgoing segment
      const r0Straight = cells[0]?.querySelector('[data-segment-kind="straight"]');
      expect(r0Straight).toBeTruthy();

      // Row 1 has incoming segment and straight outgoing segment
      const r1Incoming = cells[1]?.querySelector('[data-segment-kind="incoming"]');
      const r1Straight = cells[1]?.querySelector('[data-segment-kind="straight"]');
      expect(r1Incoming).toBeTruthy();
      expect(r1Straight).toBeTruthy();

      // Row 2 (root) has incoming segment but no outgoing segment
      const r2Incoming = cells[2]?.querySelector('[data-segment-kind="incoming"]');
      const r2Outgoing = cells[2]?.querySelector('[data-segment-kind="straight"]');
      expect(r2Incoming).toBeTruthy();
      expect(r2Outgoing).toBeNull();

      await act(async () => {
        root.unmount();
      });
    });

    it('Fixture 2: Two-parent merge commit renders straight + branch outgoing curves', async () => {
      // Merge commit m1 with parents [p1, b1]
      const commits = [
        makeMockCommit('m1', ['p1', 'b1']),
        makeMockCommit('b1', ['p1']),
        makeMockCommit('p1', []),
      ];

      const graph = buildCommitGraph(commits);
      expect(graph).toHaveLength(3);

      const root = createRoot(container);
      await act(async () => {
        root.render(
          <div>
            <GraphCell row={graph[0]!} />
            <GraphCell row={graph[1]!} previousRow={graph[0]!} />
            <GraphCell row={graph[2]!} previousRow={graph[1]!} />
          </div>,
        );
      });

      const cells = container.querySelectorAll('.graph-cell-svg');
      // Merge commit at row 0 has straight to lane 0 and branch to lane 1
      const m1Cell = cells[0];
      expect(m1Cell?.querySelector('[data-segment-kind="straight"]')).toBeTruthy();
      expect(m1Cell?.querySelector('[data-segment-kind="branch"]')).toBeTruthy();

      // Row 1 has pass-through segment on lane 0
      const b1Cell = cells[1];
      expect(b1Cell?.querySelector('[data-segment-kind="pass-through"]')).toBeTruthy();

      await act(async () => {
        root.unmount();
      });
    });
  });
});
