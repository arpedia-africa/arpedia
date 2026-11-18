import { createElement } from 'react';
import { icons } from './icon-paths';

export type IconName = keyof typeof icons;

/** Myna UI icon from the admin prototype sprite (outline, 1.5 stroke). */
export function Icon({ name, size, className }: { name: IconName; size?: 's' | 'xs'; className?: string }) {
  const def = icons[name] as { viewBox: string; fill?: boolean; shapes: { tag: string; [k: string]: string }[] };
  return (
    <svg
      className={['ico', size, def.fill ? 'fill' : '', className].filter(Boolean).join(' ')}
      viewBox={def.viewBox}
      aria-hidden="true"
      focusable="false"
    >
      {def.shapes.map(({ tag, ...props }, i) => createElement(tag, { key: i, ...props }))}
    </svg>
  );
}
