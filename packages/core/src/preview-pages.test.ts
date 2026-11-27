import { describe, expect, it } from 'vitest';
import { samplePreviewPages, type SampleChapter } from './preview-pages';

/** A chapter of `n` paragraphs of `words` words each, "c{ch}p{i}" as the text. */
const chapter = (ch: number, n: number, words = 50, extra: Partial<SampleChapter> = {}): SampleChapter => ({
  title: `Chapter title ${ch}`,
  kind: 'chapter',
  front: null,
  blocks: Array.from({ length: n }, (_, i) => ({ text: `c${ch}p${i}`, words })),
  ...extra,
});

describe('samplePreviewPages (flow 11 rule 21)', () => {
  it('gives the first page, a middle page and the page where the preview ends', () => {
    // Front matter, then 10 chapters of 20 × 50 words (10,000 words); the cut is chapter 1, paragraph 19.
    const front = { ...chapter(0, 2), title: 'Copyright', front: 'copyright' };
    const work = {
      chapters: [front, ...Array.from({ length: 10 }, (_, i) => chapter(i + 1, 20))],
      preview: { chapter: 1, paragraph: 19 },
    };
    const pages = samplePreviewPages(work);
    expect(pages.map((p) => p.label)).toEqual(['First page', 'Chapter 5, page 4', 'Chapter 1, page 4']);
    expect(pages[0]).toEqual({ label: 'First page', title: 'Chapter title 1', paras: ['c1p0', 'c1p1'] });
    // Half of 10,000 words is the end of chapter 5: its last paragraph starts the middle card.
    expect(pages[1]!.paras).toEqual(['c5p19']);
    expect(pages[2]).toEqual({
      label: 'Chapter 1, page 4',
      paras: ['c1p18', 'c1p19'],
      end: 'The free preview ends here (10%)',
    });
  });

  it("uses the book's own preview percent", () => {
    const work = { chapters: [chapter(1, 40)], preview: { chapter: 0, paragraph: 9 }, previewPercent: 25 };
    expect(samplePreviewPages(work).at(-1)?.end).toBe('The free preview ends here (25%)');
  });

  it('skips scene breaks, empty paragraphs and full-page images, and stops at three paragraphs', () => {
    const c = chapter(1, 6, 10);
    c.blocks[1] = { text: '* * *', words: 0, sceneBreak: true };
    c.blocks[2] = { text: '  ', words: 0 };
    c.blocks[3] = { text: '', words: 0, images: [{ alone: true }] };
    const [firstPage] = samplePreviewPages({
      chapters: [c, chapter(2, 40)],
      preview: { chapter: 1, paragraph: 5 },
    });
    expect(firstPage!.paras).toEqual(['c1p0', 'c1p4', 'c1p5']);
  });

  it('never repeats a page: a short book shows the first page and the preview end', () => {
    const pages = samplePreviewPages({ chapters: [chapter(1, 3)], preview: { chapter: 0, paragraph: 0 } });
    expect(pages.map((p) => p.label)).toEqual(['First page', 'Chapter 1, page 1']);
  });

  it('counts only body chapters as "Chapter N"', () => {
    const part = { ...chapter(0, 1), title: 'Part One', kind: 'part' as const };
    const work = { chapters: [part, chapter(1, 10), chapter(2, 10)], preview: { chapter: 2, paragraph: 0 } };
    expect(samplePreviewPages(work).at(-1)?.label).toBe('Chapter 2, page 1');
  });

  it('is empty when nothing is readable', () => {
    expect(samplePreviewPages({ chapters: [], preview: { chapter: 0, paragraph: 0 } })).toEqual([]);
  });
});
