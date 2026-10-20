// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Checkbox, CheckboxField } from '../../../src/components/ui/Checkbox';

describe('Checkbox', () => {
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

  it('forwards checkbox input props and change events', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <Checkbox
          className="my-checkbox"
          data-testid="cb"
          checked={false}
          onChange={(e) => onChange(e.target.checked)}
        />,
      );
    });
    const input = container.querySelector('[data-testid="cb"]') as HTMLInputElement;
    expect(input.type).toBe('checkbox');
    expect(input.className).toBe('my-checkbox');

    await act(async () => {
      input.click();
    });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('CheckboxField reports the next checked state', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <CheckboxField
          checked={false}
          onChange={onChange}
          labelTestId="field-label"
          checkboxTestId="field-checkbox"
        >
          <span>Label</span>
        </CheckboxField>,
      );
    });
    const label = container.querySelector('[data-testid="field-label"]')!;
    expect(label.textContent).toContain('Label');

    const input = container.querySelector('[data-testid="field-checkbox"]') as HTMLInputElement;
    await act(async () => {
      input.click();
    });
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
