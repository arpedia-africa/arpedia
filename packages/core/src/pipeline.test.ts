import { describe, expect, it } from 'vitest';
import {
  alignParagraphs,
  fingerprint,
  matchChapters,
  newParaId,
  normaliseText,
  trigramOverlap,
} from './anchors';
import { countBook, countWords } from './counting';
import { chapterWeights, freeParagraphs, peekParagraphs, previewCut } from './preview';
import { chapterPrices } from './pricing';
import { fastLaneReasons, readinessScore, route } from './readiness';
import { chapterAad, keyLabel, newKey, openFile, sealFile, unwrapKey, wrapKey } from './seal';

const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const paras = (n: number, words: number) => Array.from({ length: n }, () => words);

describe('countWords', () => {
  it('counts runs of letters or digits', () => {
    expect(countWords('Ada walked 3 miles to Ibadan.')).toBe(6);
    expect(countWords('')).toBe(0);
    expect(countWords('  ... !!! ')).toBe(0);
  });
  it('counts hyphenated words and contractions once; dashes split', () => {
    expect(countWords('a well-known mother-in-law')).toBe(3);
    expect(countWords("don't won’t")).toBe(2);
    expect(countWords('rain—sun – wind')).toBe(3);
    expect(countWords('Ọmọ Ọlọ́run, Ẹ̀kọ́')).toBe(3);
  });
});

describe('countBook', () => {
  it('skips front matter, adds full-page images, prices by pages', () => {
    const body = Array.from({ length: 249 }, () => 'word '.repeat(250).trim());
    const c = countBook([
      { front: 'copyright', paragraphs: ['All rights reserved by the author and publisher'] },
      { paragraphs: ['Acknowledgements: thank you all'] },
      {
        paragraphs: body,
        images: [
          { width: 1200, height: 1600, alone: true },
          { width: 400, height: 300, alone: true },
          { width: 1600, height: 900, alone: false },
        ],
      },
    ]);
    expect(c.sectionWords[0]).toBe(0);
    expect(c.words).toBe(62250 + 4);
    expect(c.imagePages).toBe(1);
    expect(c.pages).toBe(250 + 1);
    expect(c.price).toBe(126);
  });
  it('matches the flow examples', () => {
    const book = (words: number) => countBook([{ paragraphs: ['w '.repeat(words).trim()] }]);
    expect([book(62_400).pages, book(62_400).price]).toEqual([250, 125]);
    expect([book(71_480).pages, book(71_480).price]).toEqual([286, 143]);
    expect(book(10).price).toBe(1);
  });
});

describe('previewCut', () => {
  it('cuts at the paragraph end nearest 10%', () => {
    const cut = previewCut([paras(10, 100), paras(40, 100), paras(50, 100)]);
    expect(cut).toMatchObject({ chapter: 0, paragraph: 9, words: 1000, percent: 10, freeThrough: 0 });
  });
  it('cuts inside a chapter when the target falls there', () => {
    const cut = previewCut([paras(50, 100), paras(50, 100)], 20);
    expect(cut).toMatchObject({ chapter: 0, paragraph: 19, words: 2000, percent: 20 });
    expect(cut.freeThrough).toBe(-1);
  });
  it('snaps to the chapter end when within 150 words of it', () => {
    // 10% of 10,000 = 1,000; chapter 0 ends at 1,120, so the cut at 1,000 moves to 1,120
    const cut = previewCut([[...paras(10, 100), 120], paras(88, 100)]);
    expect(cut).toMatchObject({ chapter: 0, paragraph: 10, words: 1120, freeThrough: 0 });
  });
  it('never goes past 25% and never before the first paragraph', () => {
    const cut = previewCut([[3000], [1000], [1000]]);
    expect(cut).toMatchObject({ chapter: 0, paragraph: 0, words: 3000 });
    const capped = previewCut([[100, 2000, 100]], 25);
    expect(capped.words).toBeLessThanOrEqual(0.25 * 2200);
    expect(capped.paragraph).toBe(0);
  });
  it('accepts 5–25% only', () => {
    expect(() => previewCut([[100]], 4)).toThrow(RangeError);
    expect(() => previewCut([[100]], 26)).toThrow(RangeError);
  });
});

describe('peek and free files', () => {
  it('peek runs to the first paragraph end at or after 300 words, at most 40%, never all', () => {
    expect(peekParagraphs(paras(20, 100))).toBe(3);
    expect(peekParagraphs([150, 100, 100, 100])).toBe(1); // a second paragraph would pass 40%
    expect(peekParagraphs([50, 50])).toBe(0);
    expect(peekParagraphs([1000])).toBe(0);
  });
  it('every free file is a prefix of its full file', () => {
    const chapters = [paras(10, 100), paras(30, 120), [400, 50, 600, 30], paras(12, 80)];
    const cut = previewCut(chapters);
    const free = freeParagraphs(chapters, cut);
    free.forEach((n, c) => {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(chapters[c]!.length);
      if (c > cut.chapter) expect(n).toBeLessThan(chapters[c]!.length);
    });
    expect(free[cut.chapter]).toBe(cut.paragraph + 1);
  });
  it('weights feed chapter prices that sum to the book price, free chapters at 0', () => {
    const words = [1000, 3000, 2000];
    const w = chapterWeights(words, [0, 1, 0], 0);
    expect(w).toEqual([0, 13, 8]);
    const prices = chapterPrices(12, w);
    expect(prices[0]).toBe(0);
    expect(total(prices)).toBe(12);
  });
});

describe('readiness', () => {
  it('scores 100 minus capped weights', () => {
    expect(readinessScore([])).toBe(100);
    expect(readinessScore([{ check_key: 'cover_too_small' }])).toBe(92);
    const images = Array.from({ length: 5 }, () => ({ check_key: 'image_too_large' }));
    expect(readinessScore(images)).toBe(85); // 5 × 5 capped at 15
    expect(readinessScore([{ check_key: 'unknown_check' }])).toBe(100);
    const many = [
      'plagiarism_medium',
      'policy_borderline',
      'repeated_text',
      'pdf_source',
      'low_structure_confidence',
      'toc_mismatch',
      'cover_too_small',
      'copyright_missing',
      'repeated_text',
      'pdf_source',
      'policy_borderline',
      'plagiarism_medium',
    ].map((check_key) => ({ check_key }));
    expect(readinessScore(many)).toBe(0);
  });
  it('routes at 90 with no blocking flag', () => {
    expect(route([{ check_key: 'pdf_source' }])).toBe('ready_for_review');
    expect(route([{ check_key: 'pdf_source' }, { check_key: 'cover_aspect' }])).toBe('needs_fixes');
    expect(route([{ check_key: 'policy_hit' }])).toBe('needs_fixes');
  });
  it('fast lane only for small, clean updates', () => {
    const small = {
      insertedWords: 300,
      deletedWords: 300,
      baseWords: 60_000,
      chaptersAdded: 0,
      chaptersRemoved: 0,
      coverChanged: false,
      metadataChanged: false,
    };
    expect(fastLaneReasons(small, [], true)).toEqual([]);
    expect(fastLaneReasons({ ...small, insertedWords: 1200 }, [], true)).toEqual(['changed_pct']);
    expect(fastLaneReasons({ ...small, chaptersAdded: 1 }, [], true)).toEqual(['chapters_changed']);
    expect(fastLaneReasons({ ...small, coverChanged: true }, [], true)).toEqual(['cover_changed']);
    expect(fastLaneReasons(small, [], false)).toEqual(['author_standing']);
    expect(fastLaneReasons(small, [{ check_key: 'policy_hit' }], true)).toEqual(['blocking_flag']);
  });
});

describe('anchors', () => {
  const ids = (() => {
    let n = 0;
    return () => `p_new${String(n++).padStart(6, 'a')}`;
  })();
  it('makes ids of the right shape and stable fingerprints', async () => {
    expect(newParaId()).toMatch(/^p_[a-z2-7]{10}$/);
    expect(normaliseText('  Hello,   WORLD! ')).toBe('hello world');
    expect(await fingerprint('Hello, world')).toBe(await fingerprint('hello   WORLD!!'));
    expect(await fingerprint('Hello, world')).toMatch(/^[0-9a-f]{40}$/);
  });
  it('keeps ids for exact and fuzzy matches; removed paragraphs point to the nearest kept one', async () => {
    const t = [
      'The harmattan came early that year and the dust settled on everything we owned.',
      'Mama said nothing as she swept the yard each morning before the sun rose.',
      'This paragraph will be removed entirely from the second edition of the book.',
      'By December the letters had stopped coming and nobody spoke of Lagos anymore.',
    ];
    const base = await Promise.all(
      t.map(async (text, i) => ({ id: `p_old${i}aaaaaa`, fp: await fingerprint(text), text })),
    );
    const edited = 'By December the letters had stopped coming and nobody spoke of Lagos any longer.';
    const nextText = [t[0]!, t[1]!, edited, 'A brand new closing paragraph about the rains.'];
    const next = await Promise.all(nextText.map(async (text) => ({ fp: await fingerprint(text), text })));
    const a = alignParagraphs(base, next, ids);
    expect(a.ids.slice(0, 3)).toEqual(['p_old0aaaaaa', 'p_old1aaaaaa', 'p_old3aaaaaa']);
    expect(a.method).toEqual(['exact', 'exact', 'fuzzy', 'new']);
    expect(a.migrations).toEqual([
      { old_para_id: 'p_old2aaaaaa', new_para_id: null, nearest_para_id: 'p_old1aaaaaa', method: 'nearest' },
    ]);
    expect(trigramOverlap(t[3]!, edited)).toBeGreaterThanOrEqual(0.6);
  });
  it('matches chapters by paragraph overlap so they keep chapter_uid', () => {
    const base = [
      { title: 'One', fps: ['a', 'b', 'c', 'd', 'e'] },
      { title: 'Two', fps: ['f', 'g', 'h'] },
      { title: 'Map', fps: [] },
    ];
    const next = [
      { title: 'One (revised)', fps: ['a', 'b', 'c', 'x', 'e'] },
      { title: 'Epilogue', fps: ['y', 'z'] },
      { title: 'Two', fps: ['f', 'g', 'h', 'i'] },
      { title: 'Map', fps: [] },
    ];
    expect(matchChapters(base, next)).toEqual([0, null, 1, 2]);
  });
});

describe('seal', () => {
  const rev = '12000000-0000-4000-e000-000000000001';
  it('round-trips and lays out IV | ciphertext | tag', async () => {
    const key = newKey();
    const plain = new TextEncoder().encode('<p id="p_aaaaaaaaaa">Chapter one</p>');
    const sealed = await sealFile(key, plain, chapterAad(rev, 'c0.full'));
    expect(sealed.length).toBe(12 + plain.length + 16);
    expect(new TextDecoder().decode(await openFile(key, sealed, chapterAad(rev, 'c0.full')))).toContain(
      'Chapter one',
    );
  });
  it('fails with the wrong key, path or a flipped byte', async () => {
    const key = newKey();
    const sealed = await sealFile(key, new Uint8Array([1, 2, 3]), chapterAad(rev, 'c1.full'));
    await expect(openFile(newKey(), sealed, chapterAad(rev, 'c1.full'))).rejects.toThrow();
    await expect(openFile(key, sealed, chapterAad(rev, 'c2.full'))).rejects.toThrow();
    const bad = sealed.slice();
    bad[14]! ^= 1;
    await expect(openFile(key, bad, chapterAad(rev, 'c1.full'))).rejects.toThrow();
  });
  it('wraps chapter keys under the master key', async () => {
    const master = newKey();
    const key = newKey();
    const wrapped = await wrapKey(master, key, keyLabel(rev, null));
    expect(await unwrapKey(master, wrapped, keyLabel(rev, null))).toEqual(key);
    await expect(unwrapKey(master, wrapped, keyLabel(rev, 'x'))).rejects.toThrow();
    await expect(sealFile(new Uint8Array(16), key, 'x')).rejects.toThrow(RangeError);
  });
});
