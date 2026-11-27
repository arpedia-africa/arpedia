// Studio step 4 (docs/prd/11-author-studio.md rule 21): the pages an author swipes through before
// submitting: the first page, a middle page and the page where the free preview ends. Built from the
// working copy (`work/{rev}/v{n}/book.json`, packages/convert `WorkCopy`) the api Worker's
// `/v1/books/preview-url` serves to the book's author and staff.
import { PREVIEW_PERCENT, type PreviewCut } from './preview';

/** One page card: `.st-pg` (small label, optional chapter title, paragraphs, optional end line). */
export interface PreviewPageSample {
  /** "First page", "Chapter 9, page 3". Unique within the list. */
  label: string;
  title?: string;
  paras: string[];
  /** "The free preview ends here (10%)" on the cut page. */
  end?: string;
}

/** The parts of a working-copy block and chapter the samples read. */
export interface SampleBlock {
  text: string;
  words: number;
  sceneBreak?: boolean;
  images?: { alone: boolean }[];
}
export interface SampleChapter {
  title: string;
  kind: 'chapter' | 'part';
  front: unknown;
  blocks: SampleBlock[];
}
export interface SampleWork {
  chapters: SampleChapter[];
  preview: Pick<PreviewCut, 'chapter' | 'paragraph'>;
  /** The cut's target, 5–25; 10 when unset. */
  previewPercent?: number;
}

/** A standard page (money rule: 250 words). */
const PAGE_WORDS = 250;
/** About what fits on a page card at reading size; at most this many paragraphs. */
const CARD_WORDS = 70;
const CARD_PARAS = 3;

const readable = (b: SampleBlock | undefined): b is SampleBlock =>
  !!b && !b.sceneBreak && b.text.trim().length > 0 && !b.images?.some((i) => i.alone);

const isBody = (c: SampleChapter) => c.kind === 'chapter' && !c.front && c.blocks.some(readable);

/** Paragraphs from block `from` onwards until the card is full (at least one). */
function forward(blocks: SampleBlock[], from: number): string[] {
  const out: string[] = [];
  let words = 0;
  for (
    let i = from;
    i < blocks.length && out.length < CARD_PARAS && (out.length === 0 || words < CARD_WORDS);
    i++
  ) {
    const b = blocks[i];
    if (!readable(b)) continue;
    out.push(b.text.trim());
    words += b.words;
  }
  return out;
}

/** Paragraphs ending at block `to`, so the card stops where the preview stops. */
function backward(blocks: SampleBlock[], to: number): string[] {
  const out: string[] = [];
  let words = 0;
  for (
    let i = Math.min(to, blocks.length - 1);
    i >= 0 && out.length < CARD_PARAS && (out.length === 0 || words < CARD_WORDS);
    i--
  ) {
    const b = blocks[i];
    if (!readable(b)) continue;
    out.unshift(b.text.trim());
    words += b.words;
  }
  return out;
}

/** The first, a middle and the preview-end page of a working copy. Empty when nothing is readable. */
export function samplePreviewPages(work: SampleWork): PreviewPageSample[] {
  const { chapters } = work;
  // "Chapter N" counts body chapters only (not parts, front matter or empty chapters).
  const number = new Map<number, number>();
  chapters.forEach((c, i) => {
    if (isBody(c)) number.set(i, number.size + 1);
  });
  const label = (ch: number, block: number) => {
    const c = chapters[ch]!;
    const before = c.blocks.slice(0, block).reduce((a, b) => a + b.words, 0);
    const n = number.get(ch);
    const page = Math.floor(before / PAGE_WORDS) + 1;
    return n ? `Chapter ${n}, page ${page}` : `${c.title}, page ${page}`;
  };

  const body = [...number.keys()];
  const first = body[0];
  const firstPage =
    first === undefined
      ? null
      : { label: 'First page', title: chapters[first]!.title, paras: forward(chapters[first]!.blocks, 0) };

  // Middle: the block where half of the body's words have been read.
  let middlePage: PreviewPageSample | null = null;
  const total = body.reduce((a, i) => a + chapters[i]!.blocks.reduce((x, b) => x + b.words, 0), 0);
  let seen = 0;
  middle: for (const i of body) {
    const blocks = chapters[i]!.blocks;
    for (let j = 0; j < blocks.length; j++) {
      seen += blocks[j]!.words;
      if (seen * 2 >= total) {
        const start = blocks.findIndex((b, k) => k >= j && readable(b));
        // Not when it would repeat the first page (a very short book).
        if (start >= 0 && !(i === first && start < CARD_PARAS))
          middlePage = { label: label(i, start), paras: forward(blocks, start) };
        break middle;
      }
    }
  }

  const cut = chapters[work.preview.chapter];
  const cutPage = cut
    ? {
        label: label(work.preview.chapter, work.preview.paragraph),
        paras: backward(cut.blocks, work.preview.paragraph),
        end: `The free preview ends here (${work.previewPercent ?? PREVIEW_PERCENT}%)`,
      }
    : null;

  // The preview end wins over a middle page that lands on the same page.
  if (middlePage && cutPage && middlePage.label === cutPage.label) middlePage = null;
  return [firstPage, middlePage, cutPage].filter((p): p is PreviewPageSample => !!p && p.paras.length > 0);
}
