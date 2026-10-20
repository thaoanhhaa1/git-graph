import React from 'react';

export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', ...rest }, ref) => (
    <input ref={ref} type="checkbox" className={className} {...rest} />
  ),
);

Checkbox.displayName = 'Checkbox';

export interface CheckboxFieldProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  labelClassName?: string;
  labelTestId?: string;
  checkboxClassName?: string;
  checkboxTestId?: string;
  disabled?: boolean;
}

/** A checkbox rendered inside a clickable label with trailing content. */
export const CheckboxField: React.FC<CheckboxFieldProps> = ({
  checked,
  onChange,
  children,
  labelClassName,
  labelTestId,
  checkboxClassName,
  checkboxTestId,
  disabled,
}) => (
  <label className={labelClassName} data-testid={labelTestId}>
    <Checkbox
      className={checkboxClassName}
      data-testid={checkboxTestId}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    {children}
  </label>
);

CheckboxField.displayName = 'CheckboxField';
