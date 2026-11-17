import { describe, expect, it } from 'vitest';
import {
  AUTHOR_RATE,
  CREDIT_NAIRA,
  PREVIEW,
  UNDO_MIN,
  authorEarningKobo,
  bookPrice,
  chapterPrices,
  splitParts,
  standardPages,
} from './pricing';
import { BookManifest } from './schemas';

const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('constants', () => {
  it('match the money rules', () => {
    expect(CREDIT_NAIRA).toBe(3);
    expect(AUTHOR_RATE).toBe(1.6);
    expect(PREVIEW).toBe(0.1);
    expect(UNDO_MIN).toBe(10);
    expect(authorEarningKobo(5)).toBe(800);
  });
});

describe('standardPages', () => {
  it('rounds words up to whole pages and adds image pages', () => {
    expect(standardPages(0)).toBe(0);
    expect(standardPages(1)).toBe(1);
    expect(standardPages(250)).toBe(1);
    expect(standardPages(251)).toBe(2);
    expect(standardPages(62_400)).toBe(250);
    expect(standardPages(71_480)).toBe(286);
    expect(standardPages(500, 3)).toBe(5);
  });
  it('rejects bad input', () => {
    expect(() => standardPages(-1)).toThrow(RangeError);
    expect(() => standardPages(1.5)).toThrow(RangeError);
  });
});

describe('bookPrice', () => {
  it('is half a credit per page, rounded up, minimum 1', () => {
    expect(bookPrice(250)).toBe(125);
    expect(bookPrice(286)).toBe(143);
    expect(bookPrice(251)).toBe(126);
    expect(bookPrice(1)).toBe(1);
    expect(bookPrice(0)).toBe(1);
  });
});

describe('chapterPrices', () => {
  it('sums exactly to the book price', () => {
    const pages = [12.4, 18.9, 7.25, 20, 15.6, 3.3, 9.9, 11.1, 14.2, 19.95];
    const price = bookPrice(Math.ceil(total(pages)));
    const prices = chapterPrices(price, pages);
    expect(total(prices)).toBe(price);
    expect(prices.every(p => p >= 0 && Number.isInteger(p))).toBe(true);
  });
  it('gives free (zero-weight) chapters 0', () => {
    expect(chapterPrices(10, [0, 5, 5])).toEqual([0, 5, 5]);
  });
  it('breaks ties toward the earlier chapter', () => {
    expect(chapterPrices(4, [1, 1, 1])).toEqual([2, 1, 1]);
    expect(chapterPrices(5, [1, 1, 1])).toEqual([2, 2, 1]);
  });
  it('handles one chapter and tiny books', () => {
    expect(chapterPrices(125, [250])).toEqual([125]);
    expect(chapterPrices(1, [0.4, 0.3])).toEqual([1, 0]);
  });
  it('sums exactly over many random books', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 500; n++) {
      const pages = Array.from({ length: 1 + Math.floor(rnd() * 40) }, () => Math.round(rnd() * 2000) / 100);
      if (total(pages) === 0) continue;
      const price = bookPrice(Math.ceil(total(pages)));
      expect(total(chapterPrices(price, pages))).toBe(price);
    }
  });
  it('rejects a price with nothing to carry it', () => {
    expect(() => chapterPrices(3, [0, 0])).toThrow(RangeError);
    expect(chapterPrices(0, [0, 0])).toEqual([0, 0]);
  });
});

describe('splitParts', () => {
  const paras = (count: number, words: number) => Array.from({ length: count }, () => words);

  it('leaves chapters of 20 pages or less alone', () => {
    const parts = splitParts([{ title: 'One', paragraphs: paras(50, 100) }]);
    expect(parts).toEqual([{ title: 'One', kind: 'chapter', parentOrd: 0, start: 0, end: 50, words: 5000 }]);
  });
  it('splits a long chapter into ceil(W ÷ 5000) roughly equal parts', () => {
    const parts = splitParts([{ title: 'Long', paragraphs: paras(120, 100) }]); // 12,000 words
    expect(parts).toHaveLength(3);
    expect(parts.map(p => p.title)).toEqual(['Long · part 1', 'Long · part 2', 'Long · part 3']);
    expect(parts.every(p => p.kind === 'part' && p.words === 4000)).toBe(true);
    expect(parts[0]!.end).toBe(parts[1]!.start);
  });
  it('prefers a scene break within 15% of the ideal cut', () => {
    // 10,000 words, ideal cut after paragraph 49; a scene break at 54 (5,500 words) is within ±750
    const parts = splitParts([{ title: 'S', paragraphs: paras(100, 100), sceneBreaks: [54] }]);
    expect(parts[0]!.end).toBe(55);
  });
  it('merges a part under 750 words into its neighbour', () => {
    // 5,100 words: two parts, but one huge paragraph leaves a 100-word tail
    const parts = splitParts([{ title: 'T', paragraphs: [5000, 100] }]);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.kind).toBe('chapter');
  });
  it('keeps every paragraph exactly once', () => {
    const p = [300, 1200, 800, 2000, 50, 3000, 900, 400, 2500, 700, 1100];
    const parts = splitParts([{ title: 'X', paragraphs: p }]);
    expect(total(parts.map(x => x.words))).toBe(total(p));
    parts.slice(1).forEach((x, i) => expect(x.start).toBe(parts[i]!.end));
  });
});

describe('BookManifest', () => {
  const uid = '00000000-0000-4000-8000-000000000001';
  const ch = (price: number, ord: number) => ({
    chapter_uid: uid,
    ord,
    kind: 'chapter' as const,
    parent_ord: null,
    title: `Chapter ${ord + 1}`,
    words: 1000,
    words_before: ord * 1000,
    pages: 4,
    price_credits: price,
    free_file: null,
    full_file: `c${ord}.enc`,
    images: 0,
    paragraphs: [{ id: 'p_abcdefghij', words_before: 0 }],
  });
  const base = {
    schema_version: 1 as const,
    book_id: uid,
    revision_id: uid,
    total_words: 2000,
    pages: 8,
    price_credits: 4,
    preview_cut: { chapter_uid: uid, para_id: 'p_abcdefghij', percent: 10 },
    cipher: { alg: 'AES-GCM' as const, key_bits: 256 as const },
  };
  it('accepts chapter prices that sum to the book price', () => {
    expect(BookManifest.safeParse({ ...base, chapters: [ch(2, 0), ch(2, 1)] }).success).toBe(true);
  });
  it('rejects chapter prices that do not', () => {
    expect(BookManifest.safeParse({ ...base, chapters: [ch(2, 0), ch(1, 1)] }).success).toBe(false);
  });
});
