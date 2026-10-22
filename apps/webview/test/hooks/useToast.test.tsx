// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useToast, type UseToastResult } from '../../src/hooks/useToast';

describe('useToast', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: UseToastResult;

  const Harness: React.FC = () => {
    latest = useToast();
    return null;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Harness />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.useRealTimers();
  });

  it('shows a toast and auto-dismisses after the duration', () => {
    act(() => {
      latest.showToast('Saved', 'success', 1000);
    });
    expect(latest.toast).toEqual({ message: 'Saved', type: 'success' });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(latest.toast).toBeNull();
  });

  it('dismiss clears a toast immediately', () => {
    act(() => {
      latest.showToast('Hello', 'info', 5000);
    });
    expect(latest.toast).not.toBeNull();

    act(() => {
      latest.dismiss();
    });
    expect(latest.toast).toBeNull();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(latest.toast).toBeNull();
  });

  it('keeps an action available on the toast', () => {
    const onClick = vi.fn();
    act(() => {
      latest.showToast('Done', 'success', 5000, { label: 'Undo', onClick });
    });

    expect(latest.toast?.action?.label).toBe('Undo');
    latest.toast?.action?.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not schedule a timer when duration is zero', () => {
    act(() => {
      latest.showToast('Sticky', 'info', 0);
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(latest.toast).toEqual({ message: 'Sticky', type: 'info' });
  });
});
