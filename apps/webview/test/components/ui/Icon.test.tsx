// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Icon } from '../../../src/components/ui/Icon';

describe('Icon', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  const renderIcon = async (props: React.ComponentProps<typeof Icon>) => {
    await act(async () => {
      root.render(<Icon {...props} />);
    });
  };

  it('renders an svg that is hidden from assistive tech by default', async () => {
    await renderIcon({ name: 'search', testId: 'icon' });
    const svg = container.querySelector('[data-testid="icon"]')!;
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('adds the spinning class when spinning', async () => {
    await renderIcon({ name: 'refresh', spinning: true, testId: 'icon' });
    expect(container.querySelector('[data-testid="icon"]')!.getAttribute('class')).toContain(
      'spinning',
    );
  });

  it('applies the default currentColor stroke to stroke-based icons', async () => {
    await renderIcon({ name: 'search', testId: 'icon' });
    const svg = container.querySelector('[data-testid="icon"]')!;
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
  });

  it('omits the stroke attribute for fill-based icons', async () => {
    await renderIcon({ name: 'close', testId: 'icon' });
    const svg = container.querySelector('[data-testid="icon"]')!;
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(svg.getAttribute('stroke')).toBeNull();
  });

  it('exposes an accessible title when provided', async () => {
    await renderIcon({ name: 'alert-circle', title: 'Error' });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.querySelector('title')?.textContent).toBe('Error');
  });
});
