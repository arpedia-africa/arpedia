// The plain working copy (docs/prd/12-book-pipeline.md rule 18: work/{rev}/v{n}/book.json) and the
// edits made to it: the author's renames and merges (Studio step 3) and the staff fix operations
// (rule 30). Pure: the Worker loads a copy, applies an edit and stores the result as a new version.
import { fingerprint, newParaId, splitParts, type PreviewCut } from '@arpedia/core';
import type { BookAnchors } from './seal-book';
import { priceChapters, type WorkBlock, type WorkChapter } from './verify';

export interface WorkCopy {
  v: 1;
  chapters: WorkChapter[];
  anchors: BookAnchors;
  preview: PreviewCut;
  words: number;
  pages: number;
  price: number;
  /** Version whose prefix holds the images, when this version did not write them itself. */
  imagesFrom?: number;
  /** One untitled body at verify: rechecks raise no chapter-title flags (see `checkChapters`). */
  untitledBook?: boolean;
  /** Chapter counts the uploaded contents list allows, for the contents checks on a recheck. */
  tocChapters?: number[] | null;
  /** Preview target the cut aims for: the book's override (flow 03, 5–25), else the 10% default. */
  previewPercent?: number;
}

export type ChapterEdit = { op: 'rename'; ord: number; title: string } | { op: 'merge_up'; ord: number };

export type FixOp =
  | { op: 'rename_chapter'; chapter_uid: string; title: string }
  | { op: 'set_heading'; chapter_uid: string; para_id: string }
  | { op: 'merge_chapter_up'; chapter_uid: string }
  | { op: 'remove_paragraph'; chapter_uid: string; para_id: string }
  | { op: 'insert_copyright_page'; text: string; chapter_uid?: string; para_id?: string }
  | { op: 'dismiss_flag'; reason: string }
  | { op: 'shrink_image'; image: string };

export class FixError extends Error {}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function clone(work: WorkCopy) {
  return {
    chapters: work.chapters.map((c) => ({ ...c, blocks: [...c.blocks] })),
    anchors: {
      ...work.anchors,
      uids: [...work.anchors.uids],
      ids: work.anchors.ids.map((x) => [...x]),
      fps: work.anchors.fps.map((x) => [...x]),
    },
  };
}

/**
 * Renames and merges, then re-splits anything over 20 pages and recounts. A merged chapter keeps
 * the upper chapter's uid; the first part of a re-split keeps the chapter's uid.
 */
export function applyEdits(work: WorkCopy, edits: ChapterEdit[]): WorkCopy {
  const { chapters: ch, anchors: a } = clone(work);
  for (const e of edits) {
    if (e.ord >= ch.length) throw new RangeError('no such chapter');
    if (e.op === 'rename') Object.assign(ch[e.ord]!, { title: e.title, titled: true });
    else {
      if (e.ord < 1) throw new RangeError('the first chapter has nothing above it');
      const up = ch[e.ord - 1]!;
      up.blocks.push(...ch[e.ord]!.blocks);
      a.ids[e.ord - 1]!.push(...a.ids[e.ord]!);
      a.fps[e.ord - 1]!.push(...a.fps[e.ord]!);
      ch.splice(e.ord, 1);
      a.uids.splice(e.ord, 1);
      a.ids.splice(e.ord, 1);
      a.fps.splice(e.ord, 1);
    }
  }
  const out: WorkCopy = { ...work, chapters: [], anchors: { ...a, uids: [], ids: [], fps: [] } };
  ch.forEach((c, i) => {
    const parts = c.front ? null : splitParts([{ title: c.title, paragraphs: c.blocks.map((b) => b.words) }]);
    for (const [k, p] of (
      parts ?? [{ title: c.title, kind: c.kind, start: 0, end: c.blocks.length }]
    ).entries()) {
      out.chapters.push({
        ...c,
        title: p.title,
        kind: parts && parts.length > 1 ? 'part' : c.kind,
        blocks: c.blocks.slice(p.start, p.end),
      });
      out.anchors.uids.push(k === 0 ? a.uids[i]! : crypto.randomUUID());
      out.anchors.ids.push(a.ids[i]!.slice(p.start, p.end));
      out.anchors.fps.push(a.fps[i]!.slice(p.start, p.end));
    }
  });
  // the book's preview target (its override, else 10%)
  Object.assign(out, priceChapters(out.chapters, work.previewPercent));
  return out;
}

export interface FixResult {
  work: WorkCopy;
  /** Chapters whose checks must be re-run (rule 31), including any that no longer exist. */
  touched: string[];
  /** True when chapters, counts or prices changed, so the chapter rows must be replaced. */
  restructured: boolean;
}

/** One staff fix operation (rule 30). Staff never edit free text beyond these. */
export async function applyFix(work: WorkCopy, op: FixOp): Promise<FixResult> {
  const ordOf = (uid: string) => {
    const ord = work.anchors.uids.indexOf(uid);
    if (ord < 0) throw new FixError('That chapter is no longer in the book.');
    return ord;
  };
  const blockOf = (ord: number, id: string) => {
    const j = work.anchors.ids[ord]!.indexOf(id);
    if (j < 0) throw new FixError('That paragraph is no longer in the chapter.');
    return j;
  };
  switch (op.op) {
    case 'dismiss_flag':
      return { work, touched: [], restructured: false };
    case 'shrink_image':
      // No image codec runs in the Worker; the desk shrinks images (Notes).
      throw new FixError(
        'Images are shrunk on the desk for now. Dismiss the flag or send the book to the desk.',
      );
    case 'rename_chapter':
      return {
        work: applyEdits(work, [{ op: 'rename', ord: ordOf(op.chapter_uid), title: op.title.trim() }]),
        touched: [op.chapter_uid],
        restructured: true,
      };
    case 'merge_chapter_up': {
      const ord = ordOf(op.chapter_uid);
      if (ord < 1) throw new FixError('The first chapter has nothing above it to join.');
      return {
        work: applyEdits(work, [{ op: 'merge_up', ord }]),
        touched: [work.anchors.uids[ord - 1]!, op.chapter_uid],
        restructured: true,
      };
    }
    case 'set_heading':
    case 'remove_paragraph': {
      const ord = ordOf(op.chapter_uid);
      const j = blockOf(ord, op.para_id);
      const { chapters, anchors } = clone(work);
      const [block] = chapters[ord]!.blocks.splice(j, 1);
      anchors.ids[ord]!.splice(j, 1);
      anchors.fps[ord]!.splice(j, 1);
      if (op.op === 'set_heading') {
        if (!block!.text) throw new FixError('That paragraph has no words to use as a title.');
        Object.assign(chapters[ord]!, { title: block!.text.slice(0, 200), titled: true });
      }
      if (chapters[ord]!.blocks.length === 0) throw new FixError('A chapter cannot be left empty.');
      const next: WorkCopy = { ...work, chapters, anchors };
      Object.assign(next, priceChapters(next.chapters, work.previewPercent));
      return { work: next, touched: [op.chapter_uid], restructured: true };
    }
    case 'insert_copyright_page': {
      if (work.chapters.some((c) => c.front === 'copyright'))
        throw new FixError('This book already has a copyright page.');
      const text = op.text.trim();
      if (!text) throw new FixError('The copyright page needs some text.');
      const { chapters, anchors } = clone(work);
      const block: WorkBlock = { html: `<p>${esc(text)}</p>`, text, words: 0 };
      chapters.unshift({
        title: 'Copyright',
        titled: true,
        kind: 'chapter',
        parentOrd: null,
        front: 'copyright',
        blocks: [block],
        words: 0,
        wordsBefore: 0,
        imagePages: 0,
        pages: 0,
        priceCredits: 0,
      });
      // parent_ord points at the chapter a part came from, which has moved down one
      for (const c of chapters.slice(1)) if (c.parentOrd !== null) c.parentOrd += 1;
      const uid = op.chapter_uid ?? crypto.randomUUID();
      anchors.uids.unshift(uid);
      anchors.ids.unshift([op.para_id ?? newParaId()]);
      anchors.fps.unshift([await fingerprint(text)]);
      const next: WorkCopy = { ...work, chapters, anchors };
      Object.assign(next, priceChapters(next.chapters, work.previewPercent));
      return { work: next, touched: [uid], restructured: true };
    }
  }
}

/**
 * An update whose file has no copyright page keeps the live revision's one (usually added by staff
 * with a fix): same chapter uid, paragraph ids and text, so the update doesn't diff as a removed
 * chapter and nobody has to add it again on every revision. Null when there is nothing to carry.
 */
export function carryCopyright(work: WorkCopy, base: WorkCopy): WorkCopy | null {
  if (work.chapters.some((c) => c.front === 'copyright')) return null;
  const at = base.chapters.findIndex((c) => c.front === 'copyright');
  const page = base.chapters[at];
  const uid = base.anchors.uids[at];
  if (!page || !uid || page.kind !== 'chapter' || page.blocks.some((b) => b.images?.length)) return null;
  if (work.anchors.uids.includes(uid)) return null;
  const { chapters, anchors } = clone(work);
  chapters.unshift({ ...page, blocks: [...page.blocks], parentOrd: null });
  for (const c of chapters.slice(1)) if (c.parentOrd !== null) c.parentOrd += 1;
  anchors.uids.unshift(uid);
  anchors.ids.unshift([...base.anchors.ids[at]!]);
  anchors.fps.unshift([...base.anchors.fps[at]!]);
  const next: WorkCopy = { ...work, chapters, anchors };
  // the same target verify and the fixes use (preview.percent is what the cut achieved)
  Object.assign(next, priceChapters(next.chapters, work.previewPercent));
  return next;
}

/**
 * The chapter uid and paragraph id of a staff-added Copyright page, fixed by the book (coordinator
 * decision): the same in every revision, so updates never count it as a chapter removed and added.
 */
export async function copyrightAnchors(bookId: string): Promise<{ chapter_uid: string; para_id: string }> {
  const h = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${bookId}:copyright`)),
  );
  const b = h.slice(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50; // name-based (version 5 layout)
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const x = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
  return {
    chapter_uid: `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`,
    para_id: newParaId(() => h.slice(16, 26)),
  };
}

/** The text of a copyright page made from the book's details. */
export const copyrightText = (author: string, year: number) =>
  `Copyright © ${year} ${author}. All rights reserved. No part of this book may be copied or shared without the author's written permission. Published on Arpedia.`;
