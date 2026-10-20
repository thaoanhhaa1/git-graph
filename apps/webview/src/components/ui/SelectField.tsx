import React from 'react';
import { SelectControl } from './SelectControl';
import type { SelectOption } from './Select';

export interface SelectFieldProps {
  id: string;
  label: React.ReactNode;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
  wrapperClassName?: string;
  ariaLabel?: string;
  testId?: string;
}

/**
 * A labelled toolbar select: label + select pair used by the repository,
 * branch and author controls.
 */
export const SelectField: React.FC<SelectFieldProps> = ({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
  className,
  labelClassName = 'toolbar-label',
  wrapperClassName = 'toolbar-control-wrapper',
  ariaLabel,
  testId,
}) => (
  <div className={wrapperClassName}>
    <label htmlFor={id} className={labelClassName}>
      {label}
    </label>
    <SelectControl
      id={id}
      aria-label={ariaLabel}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      data-testid={testId}
      options={options}
    />
  </div>
);

SelectField.displayName = 'SelectField';
