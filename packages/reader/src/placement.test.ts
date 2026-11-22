import { describe, expect, it } from 'vitest';
import { intersects, placeToolbar, type PlacementInput, type Rect } from './placement';

const base: Omit<PlacementInput, 'rects'> = {
  toolbar: { w: 300, h: 52 },
  viewport: { w: 375, h: 780 },
  headerBottom: 60,
  bottomLimit: 730,
};

const toolbarRect = (p: { x: number; y: number }): Rect => ({ x: p.x, y: p.y, w: 300, h: 52 });

describe('placeToolbar', () => {
  it('sits centred above the selection with an 8 px gap', () => {
    const rects = [{ x: 100, y: 400, w: 150, h: 24 }];
    const p = placeToolbar({ ...base, rects });
    expect(p.kind).toBe('above');
    expect(p.y).toBe(400 - 8 - 52);
    expect(p.x).toBe(175 - 150);
  });

  it('flips below when the selection is near the top', () => {
    const rects = [{ x: 20, y: 90, w: 200, h: 24 }];
    const p = placeToolbar({ ...base, rects });
    expect(p.kind).toBe('below');
    expect(p.y).toBe(90 + 24 + 8);
  });

  it('docks at the bottom when the selection fills the page', () => {
    const rects = Array.from({ length: 24 }, (_, i) => ({ x: 20, y: 80 + i * 26, w: 335, h: 24 }));
    const p = placeToolbar({ ...base, rects });
    expect(p.kind).toBe('docked');
    expect(p.y).toBe(730 - 52);
  });

  it('stays on screen at the edges', () => {
    const left = placeToolbar({ ...base, rects: [{ x: 0, y: 400, w: 10, h: 24 }] });
    const right = placeToolbar({ ...base, rects: [{ x: 360, y: 400, w: 10, h: 24 }] });
    expect(left.x).toBe(8);
    expect(right.x).toBe(375 - 300 - 8);
  });

  it('never intersects a selection rect when above or below', () => {
    for (let y = 70; y < 700; y += 7) {
      for (const lines of [1, 2, 3, 6]) {
        const rects = Array.from({ length: lines }, (_, i) => ({ x: 30, y: y + i * 26, w: 280, h: 24 }));
        if (rects.at(-1)!.y + 24 > 730) continue;
        const p = placeToolbar({ ...base, rects });
        if (p.kind === 'docked') continue;
        for (const r of rects) expect(intersects(toolbarRect(p), r)).toBe(false);
      }
    }
  });
});
