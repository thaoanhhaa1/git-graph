import React from 'react';

export interface MenuItemRowProps {
  id: string;
  label: React.ReactNode;
  focused?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  onMouseEnter?: () => void;
}

export const MenuItemRow: React.FC<MenuItemRowProps> = ({
  id,
  label,
  focused = false,
  disabled = false,
  title,
  onClick,
  onMouseEnter,
}) => (
  <div
    role="menuitem"
    tabIndex={focused && !disabled ? 0 : -1}
    aria-selected={focused}
    aria-disabled={disabled}
    title={title}
    className={`commit-action-menu-item ${focused ? 'focused' : ''} ${disabled ? 'disabled' : ''}`}
    data-testid={`action-menu-item-${id}`}
    onClick={() => {
      if (!disabled) {
        onClick();
      }
    }}
    onMouseEnter={() => {
      if (!disabled) {
        onMouseEnter?.();
      }
    }}
  >
    <span className="commit-action-menu-item-label">{label}</span>
  </div>
);

MenuItemRow.displayName = 'MenuItemRow';

export const MenuSeparator: React.FC = () => (
  <div
    className="commit-action-menu-separator"
    role="separator"
    data-testid="action-menu-separator"
  />
);

MenuSeparator.displayName = 'MenuSeparator';
