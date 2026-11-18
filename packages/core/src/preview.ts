// Preview cut and free files (docs/prd/12-book-pipeline.md rules 15 and 17).
// Chapters are given as the word count of each paragraph, in reading order.

/** Default share of counted words that is free; staff may set 5 to 25 (flow 03). */
export const PREVIEW_PERCENT = 10;
export const PREVIEW_MIN_PERCENT = 5;
export const PREVIEW_MAX_PERCENT = 25;
/** A cut this close to a chapter's end moves to the end. */
const SNAP_WORDS = 150;
const SNAP_SHARE = 0.05;
/** Peek: opening paragraphs to the first paragraph end at or after 300 words, capped at 40%. */
const PEEK_WORDS = 300;
const PEEK_SHARE = 0.4;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface PreviewCut {
  /** Chapter holding the cut. */
  chapter: number;
  /** Index of the last free paragraph in that chapter. */
  paragraph: number;
  /** Counted words up to and including the cut paragraph. */
  words: number;
  /** Real percent of the book that is free, one decimal. */
  percent: number;
  /** Highest chapter entirely inside the preview (-1: none). These chapters cost 0. */
  freeThrough: number;
}

/**
 * The cut is the paragraph end nearest `percent` of the counted words, never beyond 25% and never
 * before the first paragraph. A cut within the last 150 words or 5% of a chapter moves to its end.
 */
export function previewCut(chapters: number[][], percent = PREVIEW_PERCENT): PreviewCut {
  if (percent < PREVIEW_MIN_PERCENT || percent > PREVIEW_MAX_PERCENT)
    throw new RangeError(`preview percent must be ${PREVIEW_MIN_PERCENT}–${PREVIEW_MAX_PERCENT}`);
  const ends: { chapter: number; paragraph: number; cum: number }[] = [];
  let cum = 0;
  chapters.forEach((paras, c) =>
    paras.forEach((w, p) => {
      cum += w;
      ends.push({ chapter: c, paragraph: p, cum });
    }),
  );
  if (ends.length === 0) throw new RangeError('a book needs at least one paragraph');
  const total = cum;
  const target = (total * percent) / 100;
  const max = (total * PREVIEW_MAX_PERCENT) / 100;

  const allowed = ends.filter((e) => e.cum <= max);
  let best = allowed.length ? allowed[0]! : ends[0]!;
  for (const e of allowed) if (Math.abs(e.cum - target) < Math.abs(best.cum - target)) best = e;

  const paras = chapters[best.chapter]!;
  const chapterWords = sum(paras);
  const chapterEnd = ends.find((e) => e.chapter === best.chapter && e.paragraph === paras.length - 1)!;
  const left = chapterEnd.cum - best.cum;
  if (left > 0 && (left <= SNAP_WORDS || left <= chapterWords * SNAP_SHARE) && chapterEnd.cum <= max)
    best = chapterEnd;

  const atEnd = best.paragraph === chapters[best.chapter]!.length - 1;
  return {
    chapter: best.chapter,
    paragraph: best.paragraph,
    words: best.cum,
    percent: total === 0 ? 0 : Math.round((best.cum / total) * 1000) / 10,
    freeThrough: atEnd ? best.chapter : best.chapter - 1,
  };
}

/**
 * How many opening paragraphs of a later chapter are free as a peek: up to the first paragraph end
 * at or after 300 words, never more than 40% of the chapter and never the whole chapter.
 */
export function peekParagraphs(paras: number[]): number {
  const cap = sum(paras) * PEEK_SHARE;
  let n = 0;
  let words = 0;
  for (const w of paras) {
    if (words + w > cap) break;
    words += w;
    n++;
    if (words >= PEEK_WORDS) break;
  }
  return Math.min(n, Math.max(0, paras.length - 1));
}

/**
 * Free paragraphs per chapter: whole chapters before the cut, the cut chapter up to the cut
 * paragraph, and a peek of every later chapter. Each free file is this prefix of its full file.
 */
export function freeParagraphs(chapters: number[][], cut: PreviewCut): number[] {
  return chapters.map((paras, c) =>
    c < cut.chapter ? paras.length : c === cut.chapter ? cut.paragraph + 1 : peekParagraphs(paras),
  );
}

/**
 * Exact page weight of each chapter for price allocation: chapters entirely inside the preview weigh
 * 0, the rest weigh words ÷ 250 plus their full-page images.
 */
export function chapterWeights(chapterWords: number[], imagePages: number[], freeThrough: number): number[] {
  return chapterWords.map((w, c) => (c <= freeThrough ? 0 : w / 250 + (imagePages[c] ?? 0)));
}
