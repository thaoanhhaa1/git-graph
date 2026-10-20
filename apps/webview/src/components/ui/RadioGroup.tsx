import React from 'react';

export interface RadioOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  testId?: string;
}

export interface RadioGroupProps<T extends string = string> {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: RadioOption<T>[];
  itemClassName?: string;
}

/** Renders a group of radio inputs wrapped in labels (no extra container element). */
export function RadioGroup<T extends string = string>({
  name,
  value,
  onChange,
  options,
  itemClassName,
}: RadioGroupProps<T>): React.ReactElement {
  return (
    <>
      {options.map((option) => (
        <label key={option.value} className={itemClassName}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            data-testid={option.testId}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </>
  );
}
