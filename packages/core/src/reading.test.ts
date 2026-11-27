import { describe, expect, it } from 'vitest';
import {
  chargeKey,
  confirmCharge,
  licenceTerms,
  licenseValid,
  memoryPendingStore,
  pageAt,
  pendingCharges,
  percentToParagraph,
  positionAllowed,
  positionToPercent,
  timeLeftLabel,
  wordsLeftInChapter,
  type ReadingManifest,
} from './reading';

// 10,000 words: chapter One 500 (free), Two 3,000 (holds the cut at c1p0), Three 3,000, Four 3,500.
const m: ReadingManifest = {
  book_id: 'b',
  revision_id: 'r',
  total_words: 10000,
  preview_cut: { chapter_uid: 'c1', para_id: 'c1p0' },
  chapters: [
    {
      chapter_uid: 'c0',
      ord: 0,
      title: 'One',
      kind: 'chapter',
      words: 500,
      words_before: 0,
      pages: 2,
      price_credits: 0,
      paragraphs: [
        { id: 'c0p0', words_before: 0 },
        { id: 'c0p1', words_before: 250 },
      ],
    },
    {
      chapter_uid: 'c1',
      ord: 1,
      title: 'Two',
      kind: 'chapter',
      words: 3000,
      words_before: 500,
      pages: 12,
      price_credits: 6,
      paragraphs: [
        { id: 'c1p0', words_before: 500 },
        { id: 'c1p1', words_before: 1500 },
        { id: 'c1p2', words_before: 2500 },
      ],
    },
    {
      chapter_uid: 'c2',
      ord: 2,
      title: 'Three',
      kind: 'chapter',
      words: 3000,
      words_before: 3500,
      pages: 12,
      price_credits: 6,
      paragraphs: [
        { id: 'c2p0', words_before: 3500 },
        { id: 'c2p1', words_before: 3700 },
        { id: 'c2p2', words_before: 4500 },
      ],
    },
    {
      chapter_uid: 'c3',
      ord: 3,
      title: 'Four',
      kind: 'chapter',
      words: 3500,
      words_before: 6500,
      pages: 14,
      price_credits: 8,
      paragraphs: [{ id: 'c3p0', words_before: 6500 }],
    },
  ],
};

describe('positions and percent', () => {
  it('computes percent from the manifest words', () => {
    expect(positionToPercent(m, { chapter_uid: 'c0', para_id: 'c0p0', offset_words: 0 })).toBe(0);
    expect(positionToPercent(m, { chapter_uid: 'c1', para_id: 'c1p1', offset_words: 250 })).toBe(17.5);
    expect(positionToPercent(m, { chapter_uid: 'c3', para_id: 'c3p0', offset_words: 99999 })).toBe(100);
  });

  it('round-trips percent → paragraph → percent', () => {
    for (const pct of [0, 2.5, 17.5, 35, 44.4, 65, 99.9]) {
      const pos = percentToParagraph(m, pct)!;
      expect(positionToPercent(m, pos)).toBeCloseTo(pct, 1);
    }
  });

  it('falls back to the chapter start for an unknown paragraph', () => {
    expect(positionToPercent(m, { chapter_uid: 'c2', para_id: 'gone', offset_words: 10 })).toBe(35);
  });

  it('counts standard pages and time left', () => {
    expect(pageAt(m, { chapter_uid: 'c0', para_id: 'c0p0', offset_words: 0 })).toEqual({ page: 1, of: 40 });
    expect(pageAt(m, { chapter_uid: 'c2', para_id: 'c2p2', offset_words: 0 })).toEqual({ page: 19, of: 40 });
    expect(wordsLeftInChapter(m, { chapter_uid: 'c2', para_id: 'c2p2', offset_words: 0 })).toBe(2000);
    expect(timeLeftLabel(2000)).toBe('8 min left in chapter');
    expect(timeLeftLabel(229)).toBe('Less than a minute');
  });
});

describe('positionAllowed (the gates)', () => {
  const access = { c0: 'open', c1: 'partial', c2: 'locked', c3: 'unlocked' } as const;
  it('allows the preview up to the cut and the peek of a locked chapter only', () => {
    expect(positionAllowed(m, access, { chapter_uid: 'c1', para_id: 'c1p0', offset_words: 0 })).toBe(true);
    expect(positionAllowed(m, access, { chapter_uid: 'c1', para_id: 'c1p1', offset_words: 0 })).toBe(false);
    expect(positionAllowed(m, access, { chapter_uid: 'c2', para_id: 'c2p1', offset_words: 0 })).toBe(true);
    expect(positionAllowed(m, access, { chapter_uid: 'c2', para_id: 'c2p2', offset_words: 0 })).toBe(false);
    expect(positionAllowed(m, access, { chapter_uid: 'c3', para_id: 'c3p0', offset_words: 0 })).toBe(true);
  });
});

describe('pending charges', () => {
  it('reuses one key per chapter until confirmed', () => {
    const store = memoryPendingStore();
    let n = 0;
    const make = () => `key-${++n}`;
    const c = { user_id: 'u', book_id: 'b', chapter_uid: 'c2' };
    expect(chargeKey(store, c, make)).toBe('key-1');
    expect(chargeKey(store, c, make)).toBe('key-1');
    expect(pendingCharges(store, 'u')).toHaveLength(1);
    confirmCharge(store, 'u', 'c2');
    expect(pendingCharges(store, 'u')).toHaveLength(0);
    expect(chargeKey(store, c, make)).toBe('key-2');
  });
});

describe('licence clock', () => {
  const day = 86_400_000;
  const l = { issued_at: 1_000 * day, valid_until: 1_007 * day, device_received_at: 500 * day };
  it('expires 7 days after issue by elapsed device time', () => {
    expect(licenseValid(l, 506 * day, 505 * day)).toBe(true);
    expect(licenseValid(l, 507 * day, 506 * day)).toBe(false);
  });
  it('treats a clock moved back as expired', () => {
    expect(licenseValid(l, 503 * day, 504 * day)).toBe(false);
    expect(licenseValid(l, 499 * day, 0)).toBe(false);
  });
});

describe('licence terms (flow 10 rule 31)', () => {
  const day = 86_400_000;
  it('gives 7 recorded days under the device limit, online or download', () => {
    expect(licenceTerms(0, true, false)).toEqual({ validUntil: 7 * day, record: true });
    expect(licenceTerms(0, false, false)).toEqual({ validUntil: 7 * day, record: true });
  });
  it('lets a fourth device read online on a short unrecorded licence, but not download', () => {
    expect(licenceTerms(0, true, true)).toEqual({ validUntil: 60 * 60_000, record: false });
    expect(licenceTerms(0, false, true)).toBe('device_limit');
  });
});
