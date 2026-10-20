import React from 'react';
import { Select, type SelectProps } from './Select';

export interface SelectControlProps extends Omit<SelectProps, 'className'> {
  className?: string;
}

/**
 * Toolbar select styled with the shared `.select-control` class.
 */
export const SelectControl = React.forwardRef<HTMLSelectElement, SelectControlProps>(
  ({ className = 'select-control', ...rest }, ref) => (
    <Select ref={ref} className={className} {...rest} />
  ),
);

SelectControl.displayName = 'SelectControl';
