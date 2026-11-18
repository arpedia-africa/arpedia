// Word and page counting (docs/prd/12-book-pipeline.md rule 12). The phone shows these as hints;
// the verification Worker recomputes them with this same file and its numbers win.
import { bookPrice, standardPages } from './pricing';

/** A word is a run of letters or digits; hyphens and apostrophes inside a word join it, dashes split. */
const WORD = /[\p{L}\p{M}\p{N}]+(?:[-‐‑'’][\p{L}\p{M}\p{N}]+)*/gu;

export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

/** An image alone in its block and at least this long on its long side counts as one page. */
export const FULL_PAGE_IMAGE_PX = 800;

export interface CountImage {
  width: number;
  height: number;
  /** True when the image is the only thing in its block. */
  alone: boolean;
}

export const isFullPageImage = (img: CountImage) =>
  img.alone && Math.max(img.width, img.height) >= FULL_PAGE_IMAGE_PX;

/**
 * Front matter that is not counted. Acknowledgements and "About the author" are counted
 * (Default Q51), so they are not listed here.
 */
export const FRONT_MATTER = ['title_page', 'copyright', 'dedication', 'contents', 'epigraph'] as const;
export type FrontMatter = (typeof FRONT_MATTER)[number];

export interface CountSection {
  /** Set for front matter; such sections count 0 words and 0 pages. */
  front?: FrontMatter;
  paragraphs: string[];
  images?: CountImage[];
}

export interface BookCount {
  words: number;
  imagePages: number;
  pages: number;
  price: number;
  /** Words per counted section, in order (front matter is 0). */
  sectionWords: number[];
}

/** pages = ceil(words ÷ 250) + full-page images; price = ceil(pages ÷ 2), at least 1. */
export function countBook(sections: CountSection[]): BookCount {
  const sectionWords = sections.map((s) =>
    s.front ? 0 : s.paragraphs.reduce((a, p) => a + countWords(p), 0),
  );
  const imagePages = sections.reduce(
    (a, s) => a + (s.front ? 0 : (s.images ?? []).filter(isFullPageImage).length),
    0,
  );
  const words = sectionWords.reduce((a, b) => a + b, 0);
  const pages = standardPages(words, imagePages);
  return { words, imagePages, pages, price: bookPrice(pages), sectionWords };
}
