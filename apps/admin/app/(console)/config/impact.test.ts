import { describe, expect, it } from 'vitest';
import { impactText } from './impact';

const base = { phones: 0, phones_below: 0, readers: 0, readers_below: 0, share_pct: 0 };

describe('impactText (flow 16 rule 25)', () => {
  it('says how many readers force update locks out and their share of app opens', () => {
    expect(impactText({ phones: 2400, phones_below: 300, readers: 2100, readers_below: 280, share_pct: 12.5 })).toBe(
      '280 readers: 12.5% of phones that opened Arpedia in the last 7 days (300 of 2,400).',
    );
    expect(impactText({ ...base, phones: 4, phones_below: 1, readers: 3, readers_below: 1, share_pct: 25 })).toBe(
      '1 reader: 25% of phones that opened Arpedia in the last 7 days (1 of 4).',
    );
  });

  it('says nobody when every recent phone is up to date, or none opened the app', () => {
    expect(impactText({ ...base, phones: 10, readers: 8 })).toMatch(/^Nobody\./);
    expect(impactText(base)).toMatch(/^No phone opened Arpedia/);
  });

  it('asks for a reload when the count could not be read', () => {
    expect(impactText(null)).toMatch(/^Couldn't count/);
  });
});
