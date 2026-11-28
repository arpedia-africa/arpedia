// Rule 19: staff Quick review renders the plain working copy with the same reader bundle as the
// app, in preview mode. This builds the reader's view of a working copy without any keys: the same
// package and chapter files sealing writes (`chapterFiles`, `packageFiles`), unencrypted, and the
// reading manifest. Only the chapters asked for carry their text; the rest carry their heading,
// so a review page sends three chapters, not the whole book.
import { type ChapterAccess, type ReadingManifest, freeParagraphs } from '@arpedia/core';
import { chapterFiles, packageFiles } from './seal-book';
import type { WorkCopy } from './work';

export interface PreviewBook {
  manifest: ReadingManifest;
  /** Package and chapter files by path, as text. */
  files: Record<string, string>;
  /** The free file of the chapter holding the preview cut, by its full file's path. */
  freeFiles: Record<string, string>;
  /** Image path in the book → working-copy image path, for the chapters asked for. */
  images: Record<string, string>;
}

export interface SpotStart {
  /** Chapter index in the working copy. */
  ord: number;
  para_id: string;
  /** Words in the book before the paragraph. */
  words_before: number;
}

const readable = (b: WorkCopy['chapters'][number]['blocks'][number]) =>
  !b.sceneBreak && !b.images?.some((m) => m.alone) && !/^<h[1-6]/i.test(b.html) && b.text.trim() !== '';

/** The reading manifest of a working copy, with the paragraph ids it will be sealed with. */
export function previewManifest(
  work: WorkCopy,
  ids: { bookId: string; revisionId: string },
): ReadingManifest {
  const { uids, ids: paraIds } = work.anchors;
  const cutUid = uids[work.preview.chapter];
  const cutPara = paraIds[work.preview.chapter]?.[work.preview.paragraph];
  return {
    book_id: ids.bookId,
    revision_id: ids.revisionId,
    total_words: work.chapters.reduce((a, c) => a + c.words, 0),
    preview_cut: cutUid && cutPara ? { chapter_uid: cutUid, para_id: cutPara } : null,
    chapters: work.chapters.map((c, ord) => {
      let before = 0;
      return {
        chapter_uid: uids[ord]!,
        ord,
        title: c.title,
        kind: c.kind,
        words: c.words,
        words_before: c.wordsBefore,
        pages: c.pages,
        price_credits: c.priceCredits,
        paragraphs: c.blocks.map((b, j) => {
          const p = { id: paraIds[ord]![j]!, words_before: c.wordsBefore + before };
          before += c.front ? 0 : b.words;
          return p;
        }),
      };
    }),
  };
}

/** The reader's files for a working copy; `chapters` limits which chapters carry their text. */
export function previewBook(
  work: WorkCopy,
  opts: { bookId: string; revisionId: string; title: string; chapters?: number[] },
): PreviewBook {
  const { ids } = work.anchors;
  const want = new Set(opts.chapters ?? work.chapters.map((_, i) => i));
  const free = freeParagraphs(
    work.chapters.map((c) => c.blocks.map((b) => (c.front ? 0 : b.words))),
    work.preview,
  );
  const files = packageFiles(opts.bookId, opts.title, work.chapters);
  const freeFiles: Record<string, string> = {};
  const images: Record<string, string> = {};
  for (const [ord, c] of work.chapters.entries()) {
    const full = `c${ord}.full.xhtml`;
    const cf = chapterFiles(
      want.has(ord) ? c : { title: c.title, blocks: [] },
      ord,
      ids[ord] ?? [],
      free[ord]!,
    );
    files[full] = cf.full;
    if (ord === work.preview.chapter && want.has(ord)) {
      files[`c${ord}.free.xhtml`] = cf.free;
      freeFiles[full] = `c${ord}.free.xhtml`;
    }
    for (const img of cf.images) images[img.target] = img.src;
  }
  return { manifest: previewManifest(work, opts), files, freeFiles, images };
}

/**
 * Where the three spot-check phones open (rule 35): the first readable paragraph of the first
 * chapter, the paragraph halfway through the book's words, and the paragraph at the preview cut.
 */
export function spotStarts(work: WorkCopy): { first: SpotStart; middle: SpotStart; cut: SpotStart } | null {
  const { ids } = work.anchors;
  const all: SpotStart[] = [];
  for (const [ord, c] of work.chapters.entries()) {
    let before = c.wordsBefore;
    c.blocks.forEach((b, j) => {
      const id = ids[ord]?.[j];
      if (id && !c.front && readable(b)) all.push({ ord, para_id: id, words_before: before });
      before += c.front ? 0 : b.words;
    });
  }
  if (!all.length) return null;
  const total = work.chapters.reduce((a, c) => a + c.words, 0);
  const first = all.find((p) => work.chapters[p.ord]!.kind === 'chapter') ?? all[0]!;
  const middle = all.find((p) => p.words_before >= total / 2 && p.ord >= first.ord) ?? all[all.length - 1]!;
  const cutOrd = work.preview.chapter;
  const cutId = ids[cutOrd]?.[work.preview.paragraph];
  const cutChapter = work.chapters[cutOrd];
  const cut =
    cutId && cutChapter
      ? {
          ord: cutOrd,
          para_id: cutId,
          words_before:
            cutChapter.wordsBefore +
            cutChapter.blocks
              .slice(0, work.preview.paragraph)
              .reduce((a, b) => a + (cutChapter.front ? 0 : b.words), 0),
        }
      : first;
  return { first, middle, cut };
}

/**
 * What each chapter opens as on a spot-check phone: everything open, or (`cut`) the book as a
 * reader without a plan sees it, so the page stops at the preview cut.
 */
export function previewAccess(
  manifest: ReadingManifest,
  mode: 'open' | 'cut',
): Record<string, ChapterAccess> {
  const cut = manifest.chapters.findIndex((c) => c.chapter_uid === manifest.preview_cut?.chapter_uid);
  return Object.fromEntries(
    manifest.chapters.map((c, ord) => [
      c.chapter_uid,
      mode === 'open' || cut < 0 || ord < cut ? 'open' : ord === cut ? 'partial' : 'locked',
    ]),
  );
}
