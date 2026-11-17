// Shared money and length rules. The phone, the desk CLI and the verification Worker all price books
// with this file, so the numbers always agree (docs/prd/12-book-pipeline.md rules 12–14).

/** Naira per credit. */
export const CREDIT_NAIRA = 3;
/** Naira an author earns per credit spent on their book. */
export const AUTHOR_RATE = 1.6;
/** Share of a book that is free to read. */
export const PREVIEW = 0.1;
/** Minutes a reader has to undo a chapter charge. */
export const UNDO_MIN = 10;
/** Words in one standard page. */
export const WORDS_PER_PAGE = 250;
/** Chapters longer than this many standard pages are split into parts. */
export const SPLIT_PAGES = 20;
/** Parts shorter than this are merged into a neighbour. */
export const MIN_PART_WORDS = 750;

const assertCount = (n: number, name: string) => {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`${name} must be a whole number ≥ 0, got ${n}`);
};

/** Standard pages: ceil(words ÷ 250) plus one page per full-page image. */
export function standardPages(words: number, imagePages = 0): number {
  assertCount(words, 'words');
  assertCount(imagePages, 'imagePages');
  return Math.ceil(words / WORDS_PER_PAGE) + imagePages;
}

/** Book price in credits: ceil(pages ÷ 2), minimum 1. */
export function bookPrice(pages: number): number {
  assertCount(pages, 'pages');
  return Math.max(1, Math.ceil(pages / 2));
}

/** Naira value of a number of credits. */
export const creditsToNaira = (credits: number) => credits * CREDIT_NAIRA;

/** Author earning in kobo for credits spent (₦1.60 = 160 kobo per credit). */
export const authorEarningKobo = (credits: number) => Math.round(credits * AUTHOR_RATE * 100);

export interface SplitInput {
  title: string;
  /** Word count of each paragraph, in order. */
  paragraphs: number[];
  /** Optional: indexes of paragraphs that end with a scene break. */
  sceneBreaks?: number[];
}

export interface SplitPart {
  title: string;
  kind: 'chapter' | 'part';
  /** Index of the source chapter this part came from. */
  parentOrd: number;
  /** Paragraph range [start, end) within the source chapter. */
  start: number;
  end: number;
  words: number;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Split chapters longer than 20 standard pages (5,000 words) into parts at paragraph ends.
 * n = ceil(W ÷ 5000) parts of roughly equal size; each cut goes to the paragraph end nearest the
 * ideal point, preferring a scene break within ±15% of it; a part under 750 words merges into its
 * neighbour. Parts are titled "<chapter> · part n".
 */
export function splitParts(chapters: SplitInput[]): SplitPart[] {
  const maxWords = SPLIT_PAGES * WORDS_PER_PAGE;
  const out: SplitPart[] = [];
  chapters.forEach((ch, parentOrd) => {
    const total = sum(ch.paragraphs);
    if (total <= maxWords || ch.paragraphs.length < 2) {
      out.push({ title: ch.title, kind: 'chapter', parentOrd, start: 0, end: ch.paragraphs.length, words: total });
      return;
    }
    // cumulative words at the end of each paragraph
    const ends: number[] = [];
    ch.paragraphs.reduce((acc, w, i) => (ends[i] = acc + w), 0);
    const n = Math.ceil(total / maxWords);
    const breaks = new Set(ch.sceneBreaks ?? []);
    const cuts: number[] = []; // paragraph index after which we cut
    for (let k = 1; k < n; k++) {
      const ideal = (total * k) / n;
      const window = (total / n) * 0.15;
      const prev = cuts.at(-1) ?? -1;
      let best = -1;
      let bestScene = -1;
      for (let i = prev + 1; i < ch.paragraphs.length - 1; i++) {
        const d = Math.abs(ends[i]! - ideal);
        if (best === -1 || d < Math.abs(ends[best]! - ideal)) best = i;
        if (breaks.has(i) && d <= window && (bestScene === -1 || d < Math.abs(ends[bestScene]! - ideal)))
          bestScene = i;
      }
      const cut = bestScene !== -1 ? bestScene : best;
      if (cut !== -1 && !cuts.includes(cut)) cuts.push(cut);
    }
    // ranges, then merge any part under MIN_PART_WORDS into its neighbour
    let ranges = [-1, ...cuts].map((c, i, arr) => {
      const start = c + 1;
      const end = i + 1 < arr.length ? arr[i + 1]! + 1 : ch.paragraphs.length;
      return { start, end, words: sum(ch.paragraphs.slice(start, end)) };
    });
    let merged = true;
    while (merged && ranges.length > 1) {
      merged = false;
      const i = ranges.findIndex(r => r.words < MIN_PART_WORDS);
      if (i !== -1) {
        const j = i === ranges.length - 1 ? i - 1 : i + 1;
        const [a, b] = i < j ? [ranges[i]!, ranges[j]!] : [ranges[j]!, ranges[i]!];
        const joined = { start: a.start, end: b.end, words: a.words + b.words };
        ranges = [...ranges.slice(0, Math.min(i, j)), joined, ...ranges.slice(Math.max(i, j) + 1)];
        merged = true;
      }
    }
    if (ranges.length === 1) {
      out.push({ title: ch.title, kind: 'chapter', parentOrd, start: 0, end: ch.paragraphs.length, words: total });
      return;
    }
    ranges.forEach((r, i) =>
      out.push({ title: `${ch.title} · part ${i + 1}`, kind: 'part', parentOrd, ...r }),
    );
  });
  return out;
}

/**
 * Spread a book price over its chapters so the parts sum exactly to the price.
 * `chapterPages` are exact (fractional) page weights; a weight of 0 marks a chapter entirely inside
 * the free preview, which costs 0. Shares are floored and the leftover credits go one each to the
 * largest fractional remainders, ties to the earlier chapter.
 */
export function chapterPrices(price: number, chapterPages: number[]): number[] {
  assertCount(price, 'price');
  if (chapterPages.some(w => !(w >= 0) || !Number.isFinite(w)))
    throw new RangeError('chapter pages must be finite numbers ≥ 0');
  const total = sum(chapterPages);
  if (total === 0) {
    if (price === 0) return chapterPages.map(() => 0);
    throw new RangeError('no chargeable chapters to carry the price');
  }
  const exact = chapterPages.map(w => (price * w) / total);
  const shares = exact.map(Math.floor);
  let left = price - sum(shares);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e), w: chapterPages[i]! }))
    .filter(x => x.w > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) shares[order[k]!.i]! += 1;
  return shares;
}
