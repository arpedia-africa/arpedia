import { BookManifest, chapterAad, fingerprint, keyLabel, newKey, openFile, unwrapKey } from '@arpedia/core';
import { describe, expect, it } from 'vitest';
import { sealBook, type BaseChapter, type SealOutput } from './seal-book';
import type { WorkBlock, WorkChapter } from './verify';
import { verifyPackage } from './verify';

const REV = '12000000-0000-4000-8000-0000000000a1';
const BOOK = '12000000-0000-4000-9000-0000000000a1';
const dec = new TextDecoder();
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const block = (text: string): WorkBlock => ({ html: `<p>${text}</p>`, text, words: text.split(' ').length });
const sentence = (i: number, n = 100) => Array.from({ length: n }, (_, k) => `w${i}x${k}`).join(' ');
const chapter = (title: string, texts: string[], wordsBefore: number): WorkChapter => {
  const blocks = texts.map(block);
  const words = blocks.reduce((a, b) => a + b.words, 0);
  return {
    title,
    titled: true,
    kind: 'chapter',
    parentOrd: null,
    front: null,
    blocks,
    words,
    wordsBefore,
    imagePages: 0,
    pages: words / 250,
    priceCredits: 0,
  };
};

// 3 chapters of 10 × 100 words; cut at 10% = end of chapter 0's paragraph 2 → chapter 0 partial.
function book(edit?: (texts: string[][]) => void) {
  const texts = [0, 1, 2].map((c) => Array.from({ length: 10 }, (_, p) => sentence(c * 100 + p)));
  edit?.(texts);
  let before = 0;
  const chapters = texts.map((t, i) => {
    const c = chapter(['One', 'Two', 'Three'][i]!, t, before);
    before += c.words;
    return c;
  });
  chapters[0]!.priceCredits = 2;
  chapters[1]!.priceCredits = 2;
  chapters[2]!.priceCredits = 2;
  return chapters;
}

const preview = { chapter: 0, paragraph: 2, words: 300, percent: 10, freeThrough: -1 };
const master = newKey();
let n = 0;
const random = { uuid: () => `12000000-0000-4000-a000-${String(++n).padStart(12, '0')}` };

async function keysOf(out: SealOutput) {
  const keys = new Map<string | null, Uint8Array>();
  for (const k of out.keys)
    keys.set(k.chapter_uid, await unwrapKey(master, unb64(k.wrapped_key), keyLabel(REV, k.chapter_uid)));
  return keys;
}
const read = (out: SealOutput, key: Uint8Array, path: string) =>
  openFile(key, out.files[path]!, chapterAad(REV, path)).then((b) => dec.decode(b));
const idsIn = (html: string) => [...html.matchAll(/id="(p_[a-z2-7]{10})"/g)].map((m) => m[1]);

describe('sealBook', () => {
  it('seals chapters so free files open with K_free and locked text needs its key', async () => {
    const out = await sealBook({
      bookId: BOOK,
      revisionId: REV,
      title: 'Harmattan',
      chapters: book(),
      images: {},
      preview,
      price: 6,
      pages: 12,
      masterKey: master,
      random,
    });
    expect(BookManifest.safeParse(out.manifest).success).toBe(true);
    const keys = await keysOf(out);
    const kFree = keys.get(null)!;
    expect(keys.size).toBe(4);

    // package files and free files open with K_free
    expect(await read(out, kFree, 'content.opf')).toContain('<itemref idref="c2"/>');
    const free0 = await read(out, kFree, 'c0.free.xhtml');
    const free2 = await read(out, kFree, 'c2.free.xhtml');
    // locked full files do not
    await expect(read(out, kFree, 'c1.full.xhtml')).rejects.toThrow();
    const full0 = await read(out, keys.get(out.chapters[0]!.chapter_uid)!, 'c0.full.xhtml');
    const full2 = await read(out, keys.get(out.chapters[2]!.chapter_uid)!, 'c2.full.xhtml');

    // free file = structural prefix of the full file, ending at the cut paragraph
    expect(idsIn(free0)).toEqual(idsIn(full0).slice(0, 3));
    expect(idsIn(free2)).toEqual(idsIn(full2).slice(0, 3)); // peek: 300 words
    expect(out.manifest.preview_cut.para_id).toBe(idsIn(full0)[2]);
    expect(free2).not.toContain(sentence(204));

    // nothing remote anywhere; manifest has no text
    for (const [path, bytes] of Object.entries(out.files)) {
      const k =
        path === 'manifest.json'
          ? null
          : path.startsWith('c1.full')
            ? keys.get(out.chapters[1]!.chapter_uid)!
            : path.startsWith('c0.full')
              ? keys.get(out.chapters[0]!.chapter_uid)!
              : path.startsWith('c2.full')
                ? keys.get(out.chapters[2]!.chapter_uid)!
                : kFree;
      const text = k ? await read(out, k, path) : dec.decode(bytes);
      expect(text).not.toMatch(/(src|href)="(https?:)?\/\//);
    }
    expect(dec.decode(out.files['manifest.json']!)).not.toContain(sentence(0));
    expect(out.prices.reduce((a, p) => a + p.price_credits, 0)).toBe(6);
    expect(out.anchors).toHaveLength(30);
  });

  it('keeps paragraph ids and chapter uids across an update; removed paragraphs move', async () => {
    const first = await sealBook({
      bookId: BOOK,
      revisionId: REV,
      title: 'H',
      chapters: book(),
      images: {},
      preview,
      price: 6,
      pages: 12,
      masterKey: master,
      random,
    });
    const base: BaseChapter[] = await Promise.all(
      first.manifest.chapters.map(async (c, i) => ({
        chapter_uid: c.chapter_uid,
        title: c.title,
        paragraphs: await Promise.all(
          c.paragraphs.map(async (p, j) => ({
            id: p.id,
            fp: await fingerprint(sentence(i * 100 + j)),
            text: sentence(i * 100 + j),
          })),
        ),
      })),
    );
    const next = await sealBook({
      bookId: BOOK,
      revisionId: REV,
      title: 'H',
      images: {},
      preview,
      price: 6,
      pages: 12,
      masterKey: master,
      random,
      base,
      chapters: book((t) => {
        t[1]!.splice(4, 1); // remove a paragraph
        t[2]![0] = t[2]![0]!.replace('w200x5 ', 'changed '); // edit one word
      }),
    });
    expect(next.chapters.map((c) => c.chapter_uid)).toEqual(first.chapters.map((c) => c.chapter_uid));
    const ids = (o: SealOutput, c: number) => o.manifest.chapters[c]!.paragraphs.map((p) => p.id);
    expect(ids(next, 0)).toEqual(ids(first, 0));
    expect(ids(next, 2)).toEqual(ids(first, 2)); // fuzzy match keeps the edited paragraph's id
    expect(next.anchor_migrations).toEqual([
      {
        old_para_id: ids(first, 1)[4],
        new_para_id: null,
        nearest_para_id: ids(first, 1)[3],
        method: 'nearest',
      },
    ]);
  });

  it('works end to end from a verified package', async () => {
    const { strToU8 } = await import('fflate');
    const files = Object.fromEntries(
      Object.entries({
        'META-INF/container.xml':
          '<container><rootfiles><rootfile full-path="b.opf"/></rootfiles></container>',
        'b.opf':
          '<package><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>',
        'a.xhtml': `<h1>Only</h1>${Array.from({ length: 12 }, (_, i) => `<p>${sentence(i)}</p>`).join('')}`,
      }).map(([k, v]) => [k, strToU8(v)]),
    );
    const v = verifyPackage(files);
    if (!v.ok) throw new Error('verify failed');
    const out = await sealBook({
      bookId: BOOK,
      revisionId: REV,
      title: 'Only',
      chapters: v.chapters,
      images: v.images,
      preview: v.preview,
      price: v.price,
      pages: v.pages,
      masterKey: master,
    });
    expect(out.manifest.price_credits).toBe(v.price);
    expect(out.manifest.chapters).toHaveLength(1);
    expect(out.manifest.chapters[0]!.free_file).toBe('c0.free.xhtml');
  });
});
