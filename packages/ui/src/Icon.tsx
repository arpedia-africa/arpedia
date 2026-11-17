import { createElement, type ComponentType } from 'react';
import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';
import { icons, type IconName } from './icons/paths';
import { useTheme } from './theme';

const tags = { path: Path, circle: Circle, rect: Rect, line: Line, polyline: Polyline, polygon: Polygon, ellipse: Ellipse } as unknown as Record<
  string,
  ComponentType<Record<string, string | number>>
>;

export type IconSize = 'xs' | 's' | 'm' | 'l';
const sizes: Record<IconSize, number> = { xs: 15, s: 18, m: 22, l: 28 };

export interface IconProps {
  name: IconName;
  /** xs 15 · s 18 · m 22 (default) · l 28, or a number in design px. */
  size?: IconSize | number;
  color?: string;
  /** Solid icon (`.ico.fill`). */
  filled?: boolean;
  strokeWidth?: number;
}

/** Myna UI icon (outline, 1.5 stroke, round caps) from the prototype sprite. */
export function Icon({ name, size = 'm', color, filled, strokeWidth = 1.5 }: IconProps) {
  const { c, s } = useTheme();
  const def = icons[name];
  const px = s(typeof size === 'number' ? size : sizes[size]);
  const col = color ?? c.ink;
  const solid = filled ?? !!('fill' in def && def.fill);
  return (
    <Svg
      width={px}
      height={px}
      viewBox={def.viewBox}
      fill={solid ? col : 'none'}
      stroke={solid ? 'none' : col}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {def.shapes.map(({ tag, ...props }, i) =>
        createElement(tags[tag]!, { key: i, ...(props as Record<string, string>) }),
      )}
    </Svg>
  );
}

export type { IconName };
