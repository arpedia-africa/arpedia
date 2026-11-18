// Small-screen scaling (CLAUDE.md): design width 375dp; narrower phones scale every size by
// width ÷ 375, never below 0.85; wider phones stay at 1.

export const DESIGN_WIDTH = 375;
export const MIN_SCALE = 0.85;

/** Scale factor for a window width: min(1, max(0.85, width ÷ 375)). */
export function scaleFor(width: number): number {
  if (!(width > 0)) return 1;
  return Math.min(1, Math.max(MIN_SCALE, width / DESIGN_WIDTH));
}

/**
 * A border width as Chrome draws and lays it out: whole device pixels, rounded down, at least one
 * (1px at 2.88x is 2 device px, 1.5px is 4). Android would draw 2.88 and push everything below down.
 */
export function snapBorder(n: number, pixelRatio: number): number {
  if (!(n > 0)) return 0;
  return Math.max(1, Math.floor(n * pixelRatio + 1e-6)) / pixelRatio;
}

/** Scale a design size (font, spacing, radius, icon) by a factor. Pills (999) stay pills. */
export function scaled(n: number, scale: number): number {
  if (n >= 999) return n;
  return Math.round(n * scale * 100) / 100;
}
