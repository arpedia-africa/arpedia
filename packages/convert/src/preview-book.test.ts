import { chapterAad, keyLabel, newKey, openFile, unwrapKey } from '@arpedia/core';
import { describe, expect, it } from 'vitest';
import { previewAccess, previewBook, previewManifest, spotStarts } from './preview-book';
import { sealBook } from './seal-book';
import type { WorkBlock, WorkChapter } from './verify';
import type { WorkCopy } from './work';

const REV = '12000000-0000-4000-8000-0000000000b1';
const BOOK = '12000000-0000-4000-9000-0000000000b1';
const dec = new TextDecoder();
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const block = (text: string, extra: Partial<WorkBlock> = {}): WorkBlock => ({
  html: `<p>${text}</p>`,
  text,
  words: text.split(' ').length,
  ...extra,
});
const sentence = (i: number, n = 100) => Array.from({ length: n }, (_, k) => `w${i}x${k}`).join(' ');

// 4 chapters of 10 × 100 words; chapter 1 opens with an image; cut in chapter 1, paragraph 3.
function work(): WorkCopy {
  let before = 0;
  const chapters: WorkChapter[] = [0, 1, 2, 3].map((c) => {
    const blocks = Array.from({ length: 10 }, (_, p) => block(sentence(c * 100 + p)));
    if (c === 1)
      blocks[0] = {
        html: '<figure><img src="images/a.png" alt=""/></figure>',
        text: '',
        words: 0,
        images: [{ path: 'images/a.png', width: 800, height: 600, bytes: 1000, alone: true }],
      };
    const words = blocks.reduce((a, b) => a + b.words, 0);
    const ch: WorkChapter = {
      title: `Chapter ${c + 1}`,
      titled: true,
      kind: 'chapter',
      parentOrd: null,
      front: null,
      blocks,
      words,
      wordsBefore: before,
      imagePages: c === 1 ? 1 : 0,
      pages: words / 250,
      priceCredits: 2,
    };
    before += words;
    return ch;
  });
  return {
    v: 1,
    chapters,
    anchors: {
      uids: chapters.map((_, i) => `12000000-0000-4000-a000-00000000000${i}`),
      ids: chapters.map((c, i) => c.blocks.map((_, j) => `p_${'abcd'[i]}${String(j).padStart(9, 'a')}`)),
      fps: chapters.map((c) => c.blocks.map(() => 'f')),
      migrations: [],
    },
    preview: { chapter: 1, paragraph: 3, words: 1200, percent: 30.8, freeThrough: 0 },
    words: before,
    pages: 16,
    price: 6,
  };
}

describe('previewBook', () => {
  it('builds the same package and chapter files sealing writes, without keys', async () => {
    const w = work();
    const master = newKey();
    const sealed = await sealBook({
      bookId: BOOK,
      revisionId: REV,
      title: 'Harmattan & Rain',
      chapters: w.chapters,
      images: { 'images/a.png': new Uint8Array([1, 2, 3]) },
      preview: w.preview,
      price: w.price,
      pages: w.pages,
      masterKey: master,
      anchors: w.anchors,
    });
    const keys = new Map<string | null, Uint8Array>();
    for (const k of sealed.keys)
      keys.set(k.chapter_uid, await unwrapKey(master, unb64(k.wrapped_key), keyLabel(REV, k.chapter_uid)));
    const open = async (path: string, uid: string | null) =>
      dec.decode(await openFile(keys.get(uid)!, sealed.files[path]!, chapterAad(REV, path)));

    const p = previewBook(w, { bookId: BOOK, revisionId: REV, title: 'Harmattan & Rain' });
    for (const path of ['META-INF/container.xml', 'content.opf', 'nav.xhtml', 'style.css', 'c0.full.xhtml'])
      expect(p.files[path]).toBe(await open(path, null));
    for (const ord of [1, 2, 3])
      expect(p.files[`c${ord}.full.xhtml`]).toBe(await open(`c${ord}.full.xhtml`, w.anchors.uids[ord]!));
    // The cut chapter's free file stops at the cut paragraph, as on a reader's phone.
    expect(p.freeFiles).toEqual({ 'c1.full.xhtml': 'c1.free.xhtml' });
    expect(p.files['c1.free.xhtml']).toBe(await open('c1.free.xhtml', null));
    expect(p.files['c1.free.xhtml']).toContain(w.anchors.ids[1]![3]);
    expect(p.files['c1.free.xhtml']).not.toContain(w.anchors.ids[1]![4]);
    expect(p.images).toEqual({ 'img/c1-1.png': 'images/a.png' });
    expect(p.files['c1.full.xhtml']).toContain('src="img/c1-1.png"');
  });

  it('gives the manifest the paragraph ids and word counts sealing gives', async () => {
    const w = work();
    const sealed = await sealBook({
      bookId: BOOK,
      revisionId: REV,
      title: 'T',
      chapters: w.chapters,
      images: {},
      preview: w.preview,
      price: w.price,
      pages: w.pages,
      masterKey: newKey(),
      anchors: w.anchors,
    });
    const m = previewManifest(w, { bookId: BOOK, revisionId: REV });
    expect(m.total_words).toBe(sealed.manifest.total_words);
    expect(m.preview_cut).toEqual({
      chapter_uid: sealed.manifest.preview_cut.chapter_uid,
      para_id: sealed.manifest.preview_cut.para_id,
    });
    expect(m.chapters.map((c) => c.paragraphs)).toEqual(sealed.manifest.chapters.map((c) => c.paragraphs));
  });

  it('sends only the chapters asked for; the rest carry their heading', () => {
    const w = work();
    const p = previewBook(w, { bookId: BOOK, revisionId: REV, title: 'T', chapters: [0, 3] });
    expect(p.files['c0.full.xhtml']).toContain(w.anchors.ids[0]![9]);
    expect(p.files['c3.full.xhtml']).toContain(w.anchors.ids[3]![0]);
    expect(p.files['c2.full.xhtml']).toContain('<h1>Chapter 3</h1>');
    expect(p.files['c2.full.xhtml']).not.toContain(w.anchors.ids[2]![0]);
    expect(p.files['c1.free.xhtml']).toBeUndefined();
    expect(p.freeFiles).toEqual({});
    expect(p.images).toEqual({});
  });
});

describe('spotStarts', () => {
  it('opens on the first paragraph, the middle of the book and the preview cut', () => {
    const w = work();
    const s = spotStarts(w)!;
    expect(s.first).toEqual({ ord: 0, para_id: w.anchors.ids[0]![0], words_before: 0 });
    // 3,900 words: the middle is the first paragraph from 1,950 words, chapter 2 paragraph 0 (1,900)
    // is before it, so paragraph 1 (2,000).
    expect(s.middle).toEqual({ ord: 2, para_id: w.anchors.ids[2]![1], words_before: 2000 });
    expect(s.cut).toEqual({ ord: 1, para_id: w.anchors.ids[1]![3], words_before: 1200 });
  });

  it('skips full-page images, scene breaks and front matter', () => {
    const w = work();
    w.chapters[0]!.front = 'copyright' as WorkChapter['front'];
    w.chapters[0]!.kind = 'chapter';
    const s = spotStarts(w)!;
    // Chapter 1 opens with a full-page image, so its first readable paragraph is the second.
    expect(s.first.para_id).toBe(w.anchors.ids[1]![1]);
  });

  it('is null for a book with nothing to read', () => {
    const w = work();
    for (const c of w.chapters) c.blocks = [];
    expect(spotStarts(w)).toBeNull();
  });
});

describe('previewAccess', () => {
  it('opens everything, or stops a reader without a plan at the cut', () => {
    const m = previewManifest(work(), { bookId: BOOK, revisionId: REV });
    const [a, b, c, d] = m.chapters.map((x) => x.chapter_uid);
    expect(previewAccess(m, 'open')).toEqual({ [a!]: 'open', [b!]: 'open', [c!]: 'open', [d!]: 'open' });
    expect(previewAccess(m, 'cut')).toEqual({
      [a!]: 'open',
      [b!]: 'partial',
      [c!]: 'locked',
      [d!]: 'locked',
    });
  });
});
