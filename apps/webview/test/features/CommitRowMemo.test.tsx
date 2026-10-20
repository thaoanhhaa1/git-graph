// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const graphCellSpy = vi.fn();
const commitMetadataSpy = vi.fn();

vi.mock('../../src/features/graph/GraphCell', () => ({
  GraphCell: (props: unknown) => {
    graphCellSpy(props);
    return null;
  },
}));

vi.mock('../../src/features/graph/CommitMetadata', () => ({
  CommitMetadata: React.memo((props: unknown) => {
    commitMetadataSpy(props);
    return null;
  }),
}));

import { CommitRow, type CommitItem } from '../../src/features/graph/CommitRow';
import type { GraphRow } from '@git-graph/git-graph';

const graphRow = { row: 0, lane: 0, segments: [], maxLane: 0 } as unknown as GraphRow;

const commit: CommitItem = {
  hash: 'abc1234',
  shortHash: 'abc1234',
  message: 'Initial commit',
  author: 'Ada',
  date: '2026-01-01',
  timestamp: 1767225600,
  graphRow,
};

const commitWithRefs: CommitItem = {
  ...commit,
  refs: [{ name: 'main', type: 'localBranch' }],
};

describe('CommitRow memoization', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onSelect = () => {};

  beforeEach(() => {
    graphCellSpy.mockClear();
    commitMetadataSpy.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('does not re-render children when re-rendered with the same commit props', async () => {
    await act(async () => {
      root.render(
        <table>
          <tbody>
            <CommitRow commit={commit} isSelected={false} onSelect={onSelect} />
          </tbody>
        </table>,
      );
    });
    const afterFirst = graphCellSpy.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await act(async () => {
      root.render(
        <table>
          <tbody>
            <CommitRow commit={commit} isSelected={false} onSelect={onSelect} />
          </tbody>
        </table>,
      );
    });
    expect(graphCellSpy.mock.calls.length).toBe(afterFirst);
  });

  it('keeps metadata children stable when only selection changes', async () => {
    const onContextMenu = () => {};

    await act(async () => {
      root.render(
        <table>
          <tbody>
            <CommitRow
              commit={commitWithRefs}
              isSelected={false}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          </tbody>
        </table>,
      );
    });
    const afterFirst = commitMetadataSpy.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await act(async () => {
      root.render(
        <table>
          <tbody>
            <CommitRow
              commit={commitWithRefs}
              isSelected={true}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          </tbody>
        </table>,
      );
    });
    expect(commitMetadataSpy.mock.calls.length).toBe(afterFirst);
  });
});
