// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useBranchTouchDrag,
  type UseBranchTouchDragOptions,
} from '../../src/hooks/useBranchTouchDrag';
import type { RefBadgeItem } from '../../src/features/refs/RefBadge';

const source: RefBadgeItem = {
  name: 'feature-a',
  type: 'localBranch',
  targetSha: '1111111',
};

function createTouchEvent(type: string, clientX: number, clientY: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: [{ clientX, clientY }],
  });
  return event;
}

function Harness({ callbacks }: { callbacks: UseBranchTouchDragOptions }) {
  const { dragState, handleTouchStart } = useBranchTouchDrag(callbacks);
  return (
    <div>
      <span data-testid="badge" onTouchStart={(event) => handleTouchStart(source, event)}>
        feature-a
      </span>
      {dragState ? <span data-testid="ghost">{dragState.source.name}</span> : null}
    </div>
  );
}

describe('useBranchTouchDrag', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
    vi.restoreAllMocks();
  });

  it('starts dragging after the touch threshold and reports the target commit', async () => {
    const onStart = vi.fn();
    const onTargetChange = vi.fn();
    const onDrop = vi.fn();
    const targetRow = document.createElement('tr');
    targetRow.dataset.commitSha = 'abcdef1';
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(targetRow);

    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness callbacks={{ onStart, onTargetChange, onDrop }} />);
    });

    const badge = container.querySelector('[data-testid="badge"]') as HTMLElement;
    await act(async () => {
      badge.dispatchEvent(createTouchEvent('touchstart', 10, 10));
    });

    await act(async () => {
      document.dispatchEvent(createTouchEvent('touchmove', 12, 12));
    });
    expect(onStart).not.toHaveBeenCalled();

    await act(async () => {
      document.dispatchEvent(createTouchEvent('touchmove', 40, 60));
    });
    expect(onStart).toHaveBeenCalledWith(source);
    expect(onTargetChange).toHaveBeenCalledWith('abcdef1');
    expect(container.querySelector('[data-testid="ghost"]')).toBeTruthy();

    await act(async () => {
      document.dispatchEvent(createTouchEvent('touchend', 40, 60));
    });
    expect(onDrop).toHaveBeenCalledWith(source, 'abcdef1');
    expect(container.querySelector('[data-testid="ghost"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it('cancels without a drop when released outside any commit row', async () => {
    const onDrop = vi.fn();
    const onCancel = vi.fn();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(document.body);

    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness callbacks={{ onDrop, onCancel }} />);
    });

    const badge = container.querySelector('[data-testid="badge"]') as HTMLElement;
    await act(async () => {
      badge.dispatchEvent(createTouchEvent('touchstart', 10, 10));
    });
    await act(async () => {
      document.dispatchEvent(createTouchEvent('touchmove', 50, 50));
    });
    await act(async () => {
      document.dispatchEvent(createTouchEvent('touchend', 50, 50));
    });

    expect(onDrop).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledWith(source);

    await act(async () => root.unmount());
  });
});
