import React from 'react';
import { ICONS, type IconDefinition, type IconName } from './icons';

export type { IconName } from './icons';

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  spinning?: boolean;
  testId?: string;
  title?: string;
}

const DEFAULTS: Required<Pick<IconDefinition, 'viewBox' | 'fill' | 'stroke' | 'strokeWidth'>> = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
};

export const Icon: React.FC<IconProps> = ({
  name,
  size = 15,
  className,
  spinning,
  testId,
  title,
}) => {
  const def = ICONS[name];
  const classes = ['ui-icon', spinning ? 'spinning' : null, className].filter(Boolean).join(' ');
  const stroke = 'stroke' in def ? def.stroke : DEFAULTS.stroke;

  return (
    <svg
      className={classes}
      width={size}
      height={size}
      viewBox={def.viewBox ?? DEFAULTS.viewBox}
      fill={def.fill ?? DEFAULTS.fill}
      stroke={stroke}
      strokeWidth={def.strokeWidth ?? DEFAULTS.strokeWidth}
      strokeLinecap={def.strokeLinecap}
      strokeLinejoin={def.strokeLinejoin}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      data-testid={testId}
    >
      {title ? <title>{title}</title> : null}
      {def.children}
    </svg>
  );
};

Icon.displayName = 'Icon';
