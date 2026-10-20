import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'icon' | 'none';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn',
  icon: 'btn btn-icon',
  none: '',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', className = '', type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`${VARIANT_CLASS[variant]} ${className}`.trim()}
      {...rest}
    />
  ),
);

Button.displayName = 'Button';
