// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GraphMinimap } from '../../src/features/graph/GraphMinimap';
import type { CommitItem } from '../../src/features/graph/CommitRow';

function makeCommits(count: number): CommitItem[] {
  return Array.from({ length: count }, (_, index) => ({
    hash: `sha-${index}`,
    shortHash: `s${index}`,
    message: `Commit ${index}`,
    author: 'Alice',
    date: '2024-01-01',
  }));
}

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

describe('GraphMinimap', () => {
  let container: HTMLDivElement;
  let context: CanvasRenderingContext2D;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    context = createContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as ReturnType<HTMLCanvasElement['getContext']>,
    );
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a labelled scrollbar with viewport values', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <GraphMinimap
          commits={makeCommits(100)}
          maxGraphLane={2}
          scrollTop={240}
          viewportHeight={480}
          rowHeight={24}
          onScrollTo={() => {}}
        />,
      );
    });

    const minimap = container.querySelector('[data-testid="graph-minimap"]');
    expect(minimap).toBeTruthy();
    expect(minimap?.getAttribute('role')).toBe('scrollbar');
    expect(minimap?.getAttribute('aria-valuenow')).toBe('240');
    expect(minimap?.getAttribute('aria-valuemax')).toBe('1920');
    expect(minimap?.getAttribute('aria-label')).toContain('minimap');

    await act(async () => root.unmount());
  });

  it('scrolls to the corresponding position when clicked', async () => {
    const onScrollTo = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <GraphMinimap
          commits={makeCommits(100)}
          maxGraphLane={1}
          scrollTop={0}
          viewportHeight={480}
          rowHeight={24}
          onScrollTo={onScrollTo}
        />,
      );
    });

    const minimap = container.querySelector('[data-testid="graph-minimap"]') as HTMLDivElement;
    vi.spyOn(minimap, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      right: 48,
      bottom: 500,
      width: 48,
      height: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    await act(async () => {
      minimap.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 24, clientY: 250 }),
      );
    });

    expect(onScrollTo).toHaveBeenCalledWith(960);

    await act(async () => root.unmount());
  });

  it('supports keyboard scrolling and clamps at the bottom', async () => {
    const onScrollTo = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <GraphMinimap
          commits={makeCommits(100)}
          maxGraphLane={0}
          scrollTop={100}
          viewportHeight={480}
          rowHeight={24}
          onScrollTo={onScrollTo}
        />,
      );
    });

    const minimap = container.querySelector('[data-testid="graph-minimap"]') as HTMLDivElement;
    await act(async () => {
      minimap.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    });
    expect(onScrollTo).toHaveBeenLastCalledWith(124);

    await act(async () => {
      minimap.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    });
    expect(onScrollTo).toHaveBeenLastCalledWith(1920);

    await act(async () => root.unmount());
  });
});
