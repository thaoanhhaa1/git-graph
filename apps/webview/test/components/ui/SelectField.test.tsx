// @vitest-environment happy-dom
// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SelectField } from '../../../src/components/ui/SelectField';

describe('SelectField', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ];

  it('renders the label bound to the select and reports changes', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <SelectField
          id="branch-select"
          label="Branches:"
          value="a"
          options={options}
          onChange={onChange}
          testId="branch-select"
        />,
      );
    });

    const label = container.querySelector('label')!;
    expect(label.textContent).toBe('Branches:');
    expect(label.getAttribute('for')).toBe('branch-select');

    const select = container.querySelector('[data-testid="branch-select"]') as HTMLSelectElement;
    await act(async () => {
      select.value = 'b';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('renders a wrapper with the toolbar class by default', async () => {
    await act(async () => {
      root.render(<SelectField id="x" label="X" value="a" options={options} onChange={() => {}} />);
    });
    expect(container.querySelector('.toolbar-control-wrapper')).toBeTruthy();
  });
});
