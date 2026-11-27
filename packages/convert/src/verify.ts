// Verification of an uploaded package (docs/prd/12-book-pipeline.md rules 10–15, 24). Pure: the
// Worker hands in the unpacked files and gets back the sanitised working copy, the authoritative
// numbers and the flags. The phone runs the same function to show its hints.
import {
  type FrontMatter,
  bookPrice,
  chapterPrices,
  chapterWeights,
  countWords,
  isFullPageImage,
  previewCut,
  splitParts,
  standardPages,
  type PreviewCut,
} from '@arpedia/core';
import { Element, Text } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import { imageSize, readOpf, readToc, resolvePath, textOf } from './epub';
import { imageType, sanitizeHtml } from './sanitize';

export interface WorkBlock {
  /** Sanitised XHTML of the block (one paragraph, heading, list, quote, figure or scene break). */
  html: string;
  text: string;
  words: number;
  sceneBreak?: boolean;
  /** Images in the block (working-copy paths); `alone` when the image is the whole block. */
  images?: { path: string; width: number; height: number; bytes: number; alone: boolean }[];
}

export interface WorkChapter {
  title: string;
  /** False when no heading was found and the title was made up ("Chapter 3"). */
  titled: boolean;
  kind: 'chapter' | 'part';
  parentOrd: number | null;
  front: FrontMatter | null;
  blocks: WorkBlock[];
  words: number;
  wordsBefore: number;
  imagePages: number;
  /** Exact standard pages: words ÷ 250 plus full-page images. */
  pages: number;
  priceCredits: number;
}

export interface VerifyFlag {
  check_key: string;
  message: string;
  suggestion?: string;
  location?: { chapter_ord?: number; block?: number; image?: string };
  auto_fixable?: boolean;
  fix_op?: Record<string, unknown>;
}

export interface VerifyOk {
  ok: true;
  chapters: WorkChapter[];
  /** Working-copy images by path (`img/<n>.<ext>`), re-checked by magic bytes. */
  images: Record<string, Uint8Array>;
  words: number;
  pages: number;
  price: number;
  preview: PreviewCut;
  flags: VerifyFlag[];
  /** One untitled body: no chapter-title flags (pass to `checkChapters` when rechecking). */
  untitledBook: boolean;
  /** Chapter counts the package's own contents list allows (pass to `checkChapters`). */
  tocChapters: number[] | null;
}
export interface VerifyFailed {
  ok: false;
  reason: 'unreadable' | 'file_check_error';
  message: string;
}

export interface VerifyOptions {
  /** Preview percent, 5–25 (default 10). */
  previewPercent?: number;
  /** The separately uploaded cover, if any (else the package's cover image). */
  cover?: Uint8Array | null;
}

const FRONT_TITLES: [RegExp, FrontMatter][] = [
  [/^copyright( page)?$/i, 'copyright'],
  [/^(table of )?contents$/i, 'contents'],
  [/^dedication$/i, 'dedication'],
  [/^epigraph$/i, 'epigraph'],
  [/^title( page)?$/i, 'title_page'],
];
// Contents entries that are not chapters we count: front matter and the cover.
const NOT_A_CHAPTER = [/^cover$/i, ...FRONT_TITLES.map(([re]) => re)];
const CHAPTER_LINE = /^(chapter\s+[\w-]+|prologue|epilogue|\d{1,3}\.)$/i;
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_MAX_PX = 1600;
const MIN_WORDS = 1000;
const TITLE_PAGE_MAX_LINES = 6;
const TITLE_PAGE_LINE_WORDS = 12;
const r2 = (n: number) => Math.round(n * 100) / 100;
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface RawChapter {
  title: string | null;
  blocks: WorkBlock[];
}

export function verifyPackage(
  files: Record<string, Uint8Array>,
  opts: VerifyOptions = {},
): VerifyOk | VerifyFailed {
  let opf;
  try {
    opf = readOpf(files);
  } catch {
    return {
      ok: false,
      reason: 'unreadable',
      message: 'We could not read this file. Please send the Word version.',
    };
  }
  const flags: VerifyFlag[] = [];
  const images: Record<string, Uint8Array> = {};
  const imageByHref = new Map<string, string>();
  const dec = new TextDecoder();

  const mapImage = (fromDir: string) => (src: string) => {
    const href = resolvePath(fromDir, src);
    if (!href) return null;
    const known = imageByHref.get(href);
    if (known) return known;
    const bytes = files[href];
    const type = bytes ? imageType(bytes) : null;
    if (!bytes || !type) return null;
    const path = `img/${imageByHref.size + 1}.${type === 'jpeg' ? 'jpg' : type}`;
    imageByHref.set(href, path);
    images[path] = bytes;
    return path;
  };

  // Spine items → raw chapters; one item may hold many chapters (a converted Word file).
  const raw: RawChapter[] = [];
  for (const item of opf.spine) {
    const bytes = files[item.href];
    if (!bytes) continue;
    const dir = item.href.includes('/') ? item.href.slice(0, item.href.lastIndexOf('/')) : '';
    const clean = sanitizeHtml(dec.decode(bytes), { image: mapImage(dir) }).html;
    let current: RawChapter | null = null;
    const start = (title: string | null) => {
      current = { title, blocks: [] };
      raw.push(current);
    };
    for (const node of parseDocument(clean, { withStartIndices: true, withEndIndices: true }).children) {
      const el = node instanceof Element ? node : null;
      const text = el ? textOf([el]) : node instanceof Text ? node.data.trim() : '';
      if (!el && !text) continue;
      // A bare text node's data is entity-decoded, so it is escaped again before it becomes markup.
      const html = el ? clean.slice(el.startIndex ?? 0, (el.endIndex ?? 0) + 1) : `<p>${escText(text)}</p>`;
      const heading = el && /^h[12]$/.test(el.name);
      if ((heading && text) || (el?.name === 'p' && CHAPTER_LINE.test(text))) {
        if (!current || (current as RawChapter).blocks.some((b) => b.words > 0)) start(text);
        else (current as RawChapter).title ??= text;
        continue;
      }
      if (!current) start(null);
      const imgs = el
        ? [...(el.name === 'img' ? [el] : []), ...findAll(el, 'img')].map((img) => {
            const path = img.attribs.src!;
            const size = imageSize(images[path]!) ?? { width: 0, height: 0 };
            return { path, ...size, bytes: images[path]!.length, alone: !text };
          })
        : [];
      (current as unknown as RawChapter).blocks.push({
        html,
        text,
        words: countWords(text),
        ...(el?.name === 'div' && el.attribs.class?.includes('scene-break') ? { sceneBreak: true } : {}),
        ...(imgs.length ? { images: imgs } : {}),
      });
    }
  }
  const body = raw.filter((c) => c.blocks.length > 0);
  if (body.length === 0)
    return { ok: false, reason: 'file_check_error', message: 'This file has no text we can read.' };

  // Front matter, then parts for long chapters (rule 13).
  const front = body.map((c) => FRONT_TITLES.find(([re]) => re.test(c.title?.trim() ?? ''))?.[1] ?? null);
  // A few short untitled lines before the first chapter (the book's title, author) are the title
  // page, not an untitled "Chapter 1" (rule 7: front matter detected). A prose paragraph is not.
  const first = body[0]!;
  const titlePage =
    body.length > 1 &&
    !first.title &&
    first.blocks.length <= TITLE_PAGE_MAX_LINES &&
    first.blocks.every((b) => b.words <= TITLE_PAGE_LINE_WORDS);
  if (titlePage) front[0] = 'title_page';
  const titleOf = (c: RawChapter, i: number) =>
    c.title ?? (i === 0 && titlePage ? 'Title page' : `Chapter ${titlePage ? i : i + 1}`);
  const parts = splitParts(
    body.map((c, i) => ({
      title: titleOf(c, i),
      paragraphs: c.blocks.map((b) => (front[i] ? 0 : b.words)),
      sceneBreaks: c.blocks.flatMap((b, j) => (b.sceneBreak ? [j] : [])),
    })),
  );
  const untitledBook = body.length === 1 && !body[0]!.title;
  let wordsBefore = 0;
  const chapters: WorkChapter[] = parts.map((p, ord) => {
    const src = body[p.parentOrd]!;
    const blocks = src.blocks.slice(p.start, p.end);
    const isFront = front[p.parentOrd] ?? null;
    const words = isFront ? 0 : blocks.reduce((a, b) => a + b.words, 0);
    const imagePages = isFront ? 0 : blocks.flatMap((b) => b.images ?? []).filter(isFullPageImage).length;
    const partNo = parts.slice(0, ord + 1).filter((q) => q.parentOrd === p.parentOrd).length;
    const ch: WorkChapter = {
      title: untitledBook && p.kind === 'part' ? `Part ${partNo}` : p.title,
      titled: !!src.title,
      kind: p.kind,
      parentOrd: p.kind === 'part' ? p.parentOrd : null,
      front: isFront,
      blocks,
      words,
      wordsBefore,
      imagePages,
      pages: r2(words / 250 + imagePages),
      priceCredits: 0,
    };
    wordsBefore += words;
    return ch;
  });

  const { words, pages, price, preview } = priceChapters(chapters, opts.previewPercent);

  // The contents list's chapter count: top-level entries, or (when it nests chapters under parts)
  // the innermost ones or every one. Front matter entries are left out, as from the chapter count.
  const toc = readToc(files, opf);
  const story = (titles: string[]) =>
    titles.filter((t) => !NOT_A_CHAPTER.some((re) => re.test(t.trim()))).length;
  const counts = toc ? [story(toc.top), story(toc.leaves), story(toc.all)] : [];
  // An untitled title page is listed under the book's own name (writeEpub), so it may be one more.
  const tocChapters = toc ? [...new Set(titlePage ? counts.flatMap((n) => [n, n - 1]) : counts)] : null;

  // ─── Checks (rule 24). Plagiarism and policy run through provider adapters in the Worker. ───
  flags.push(...checkChapters(chapters, { untitledBook, tocChapters }));
  const coverBytes = opts.cover ?? (opf.coverHref ? files[opf.coverHref] : undefined) ?? null;
  const cover = coverBytes && imageType(coverBytes) ? imageSize(coverBytes) : null;
  if (cover && cover.width < 800)
    flags.push({
      check_key: 'cover_too_small',
      message: `The cover is ${cover.width} px wide; 800 px or more looks sharp.`,
    });
  if (cover && cover.height > 0 && (cover.width / cover.height < 0.55 || cover.width / cover.height > 0.7))
    flags.push({
      check_key: 'cover_aspect',
      message: 'The cover is not the usual book shape (about 2 : 3).',
    });

  return { ok: true, chapters, images, words, pages, price, preview, flags, untitledBook, tocChapters };
}

/** The flag keys checkChapters can raise; a rescore replaces only these. */
export const TEXT_CHECKS = [
  'too_short',
  'chapter_title',
  'image_too_large',
  'repeated_text',
  'copyright_missing',
  'chapter_detection_failed',
  'toc_mismatch',
];

/** Story chapters as the author wrote them: front matter left out, a chapter split into parts counted once. */
export function storyChapterCount(chapters: WorkChapter[]): number {
  return chapters.filter(
    (c, i) =>
      !c.front &&
      (c.kind === 'chapter' ||
        chapters[i - 1]?.kind !== 'part' ||
        chapters[i - 1]?.parentOrd !== c.parentOrd),
  ).length;
}

/**
 * The text checks on a chapter list: on verify, and again after a staff fix (the rescore stage,
 * rule 31). Cover checks need the cover file and stay in verifyPackage.
 */
export function checkChapters(
  chapters: WorkChapter[],
  opts: { untitledBook?: boolean; tocChapters?: number[] | null } = {},
): VerifyFlag[] {
  const flags: VerifyFlag[] = [];
  // The package's contents list names chapters: none found in the text blocks publishing (the
  // chapters would be guessed parts); a different count is flagged for a person to look at.
  const listed = opts.tocChapters ?? [];
  const named = Math.max(0, ...listed);
  if (named >= 2) {
    const found = storyChapterCount(chapters);
    if (opts.untitledBook)
      flags.push({
        check_key: 'chapter_detection_failed',
        message: `The contents list names ${named} chapters, but we could not find where they start in the text.`,
        suggestion: 'Give each chapter title a heading style in Word, then upload the file again.',
      });
    else if (!listed.includes(found))
      flags.push({
        check_key: 'toc_mismatch',
        message: `The contents list has ${listed[0]} chapters, but we found ${found} in the text.`,
        suggestion: 'Check where each chapter starts. The contents list is rebuilt from the chapters found.',
      });
  }
  const words = chapters.reduce((a, c) => a + c.words, 0);
  if (words < MIN_WORDS)
    flags.push({
      check_key: 'too_short',
      message: `This book has ${words} words. Books need at least 1,000.`,
    });
  chapters.forEach((c, ord) => {
    if (!c.titled && !c.front && !opts.untitledBook)
      flags.push({
        check_key: 'chapter_title',
        message: `Chapter ${ord + 1} has no title.`,
        suggestion: `Chapter ${ord + 1}`,
        location: { chapter_ord: ord },
        fix_op: { op: 'rename_chapter', chapter_ord: ord, title: `Chapter ${ord + 1}` },
      });
    c.blocks.forEach((b, block) =>
      (b.images ?? [])
        .filter((img) => img.bytes > IMAGE_MAX_BYTES || Math.max(img.width, img.height) > IMAGE_MAX_PX)
        .forEach((img) =>
          flags.push({
            check_key: 'image_too_large',
            message: 'An image is larger than it needs to be.',
            suggestion: 'Shrink it to 1,600 px on the long side.',
            location: { chapter_ord: ord, block, image: img.path },
            auto_fixable: true,
            fix_op: { op: 'shrink_image', image: img.path },
          }),
        ),
    );
  });
  for (let i = 0; i + 1 < chapters.length; i++) {
    const tail = chapters[i]!.blocks.slice(-2).map((b) => b.text);
    const head = chapters[i + 1]!.blocks.slice(0, 2).map((b) => b.text);
    if (tail.length === 2 && tail.every((t, k) => t && t === head[k]))
      flags.push({
        check_key: 'repeated_text',
        message: `The end of "${chapters[i]!.title}" is repeated at the start of the next chapter.`,
        suggestion: 'Remove the repeated paragraphs.',
        location: { chapter_ord: i + 1, block: 0 },
      });
  }
  if (!chapters.some((c) => c.front === 'copyright'))
    flags.push({
      check_key: 'copyright_missing',
      message: 'There is no copyright page.',
      suggestion: 'Add one from the book details.',
      auto_fixable: true,
      fix_op: { op: 'insert_copyright_page' },
    });
  return flags;
}

/**
 * Recount a chapter list in place (after verify, or after the author renames and merges):
 * words before each chapter, exact pages, the book price, the preview cut and chapter prices.
 */
export function priceChapters(chapters: WorkChapter[], previewPercent?: number) {
  let words = 0;
  for (const c of chapters) {
    c.words = c.front ? 0 : c.blocks.reduce((a, b) => a + b.words, 0);
    c.imagePages = c.front ? 0 : c.blocks.flatMap((b) => b.images ?? []).filter(isFullPageImage).length;
    c.pages = r2(c.words / 250 + c.imagePages);
    c.wordsBefore = words;
    words += c.words;
  }
  const imagePages = chapters.reduce((a, c) => a + c.imagePages, 0);
  const pages = standardPages(words, imagePages);
  const price = bookPrice(pages);
  const preview = previewCut(
    chapters.map((c) => c.blocks.map((b) => (c.front ? 0 : b.words))),
    previewPercent,
  );
  const weights = chapterWeights(
    chapters.map((c) => c.words),
    chapters.map((c) => c.imagePages),
    preview.freeThrough,
  );
  const prices = weights.some((w) => w > 0) ? chapterPrices(price, weights) : weights.map(() => 0);
  chapters.forEach((c, i) => (c.priceCredits = prices[i]!));
  return { words, pages, price, preview };
}

/**
 * A new preview cut for a sealed working copy (flow 03 admin rule 2, staff preview override). The
 * book keeps its price, spread again over the chapters now outside the preview.
 */
export function recutPreview(chapters: WorkChapter[], percent: number, price: number) {
  const preview = previewCut(
    chapters.map((c) => c.blocks.map((b) => (c.front ? 0 : b.words))),
    percent,
  );
  const weights = chapterWeights(
    chapters.map((c) => c.words),
    chapters.map((c) => c.imagePages),
    preview.freeThrough,
  );
  const prices = weights.some((w) => w > 0) ? chapterPrices(price, weights) : weights.map(() => 0);
  return { preview, chapters: chapters.map((c, i) => ({ ...c, priceCredits: prices[i]! })) };
}

function findAll(el: Element, name: string, out: Element[] = []): Element[] {
  for (const c of el.children)
    if (c instanceof Element) {
      if (c.name === name) out.push(c);
      findAll(c, name, out);
    }
  return out;
}
