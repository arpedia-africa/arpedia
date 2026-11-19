// Flow 04 rule 32: where the highlight toolbar goes. A native view over the WebView, never inside it.
// Centred above the selection with an 8 px gap; below it when there's no room above; docked in a
// bar at the bottom when neither fits. It never intersects a selection rect.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacementInput {
  /** Selection rects in WebView viewport coordinates (one per line). */
  rects: Rect[];
  toolbar: { w: number; h: number };
  viewport: { w: number; h: number };
  /** Bottom edge of the reader header: the toolbar stays below it. */
  headerBottom: number;
  /** Top edge of whatever sits at the bottom (footer, safe area): the toolbar stays above it. */
  bottomLimit: number;
  /** Side margin kept between the toolbar and the screen edge. */
  margin?: number;
}

export type Placement =
  | { kind: 'above' | 'below'; x: number; y: number }
  | { kind: 'docked'; x: number; y: number };

export const GAP = 8;

export function boundingBox(rects: Rect[]): Rect {
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function placeToolbar(i: PlacementInput): Placement {
  const margin = i.margin ?? GAP;
  const { w, h } = i.toolbar;
  const dockY = i.bottomLimit - h;
  if (i.rects.length === 0) return { kind: 'docked', x: margin, y: dockY };

  const box = boundingBox(i.rects);
  const maxX = Math.max(margin, i.viewport.w - w - margin);
  const x = Math.min(Math.max(box.x + box.w / 2 - w / 2, margin), maxX);

  const aboveY = box.y - GAP - h;
  if (aboveY >= i.headerBottom + GAP) return { kind: 'above', x, y: aboveY };

  const belowY = box.y + box.h + GAP;
  if (belowY + h <= i.bottomLimit - GAP) return { kind: 'below', x, y: belowY };

  return { kind: 'docked', x: margin, y: dockY };
}
