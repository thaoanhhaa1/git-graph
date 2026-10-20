import React from 'react';

export type TextInputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ type = 'text', ...rest }, ref) => <input ref={ref} type={type} {...rest} />,
);

TextInput.displayName = 'TextInput';
