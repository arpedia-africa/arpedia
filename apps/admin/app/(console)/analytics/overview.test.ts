import { describe, expect, it } from 'vitest';
import { finishedShare, latest, share, stickiness } from './overview';

describe('Overview numbers (flow 15 rule 25)', () => {
  it('takes monthly readers from the last day with a figure', () => {
    expect(
      latest({
        series: [
          { day: '2026-11-26', value: 21900 },
          { day: '2026-11-25', value: 21000 },
        ],
      }),
    ).toBe(21900);
    expect(latest({ series: [{ day: '2026-11-26', value: null }] })).toBeNull();
    expect(latest(undefined)).toBeNull();
  });

  it('shows DAU/MAU and the share of books started that were finished', () => {
    expect(stickiness(6904, 21900)).toBe('DAU/MAU 31.5%');
    expect(stickiness(null, 21900)).toBeNull();
    expect(stickiness(10, null)).toBeNull();
    expect(finishedShare(3812, 22424)).toBe('17% of books started');
    expect(finishedShare(5, 0)).toBeNull();
  });

  it('formats server shares, and nothing for small groups', () => {
    expect(share(18.4)).toBe('18.4%');
    expect(share(null)).toBeNull();
  });
});
