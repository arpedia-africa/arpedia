import { describe, expect, it } from 'vitest';
import { partPlan } from './partial-release';

const l = (author_id: string, payable_kobo: number) => ({ author_id, payable_kobo });

describe('partial release plan (13-12)', () => {
  it('sends everything when the balance covers it or is unknown', () => {
    const lines = [l('b', 300), l('a', 100)];
    expect(partPlan(lines, 1000)).toMatchObject({ sendKobo: 400, leftKobo: 0, left: [] });
    expect(partPlan(lines, null).send.map(x => x.author_id)).toEqual(['a', 'b']);
  });

  it('sends the smallest amounts first, whole lines only, and leaves the rest approved, not sent', () => {
    const p = partPlan([l('c', 500), l('a', 200), l('b', 200), l('d', 100)], 550);
    expect(p.send.map(x => x.author_id)).toEqual(['d', 'a', 'b']);
    expect(p.sendKobo).toBe(500);
    expect(p.left.map(x => x.author_id)).toEqual(['c']);
    expect(p.leftKobo).toBe(500);
  });

  it('stops at the first line that does not fit (same as the server), and sends nothing below the smallest', () => {
    expect(partPlan([l('a', 100), l('b', 400), l('c', 450)], 520).send.map(x => x.author_id)).toEqual(['a', 'b']);
    expect(partPlan([l('a', 100)], 99)).toMatchObject({ send: [], sendKobo: 0, leftKobo: 100 });
  });

  it('ignores lines with nothing to pay', () => {
    expect(partPlan([l('a', 0), l('b', 50)], 50).send.map(x => x.author_id)).toEqual(['b']);
  });
});
