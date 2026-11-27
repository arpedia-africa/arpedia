// Flow 04 rule 2 (spec check 04-23): a chapter's `free` file is an exact structural prefix of its
// `full` file (same head, same element order, same ids), so a CFI made while reading the free part
// resolves to the same element in the full file after an unlock, and back after an undo.
import { chapterAad, keyLabel, newKey, openFile, unwrapKey } from '@arpedia/core';
import { describe, expect, it } from 'vitest';
import { sealBook, type SealOutput } from './seal-book';
import type { WorkBlock, WorkChapter } from './verify';

const REV = '04230000-0000-4000-8000-0000000000a1';
const BOOK = '04230000-0000-4000-9000-0000000000a1';
const dec = new TextDecoder();
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const words = (i: number, n: number) => Array.from({ length: n }, (_, k) => `w${i}x${k}`).join(' ');

/** Paragraphs, a quote, a list, a heading and an image: CFIs step through nested elements too. */
function blocks(c: number): WorkBlock[] {
  const out: WorkBlock[] = [];
  for (let p = 0; p < 12; p++) {
    const t = words(c * 100 + p, 50);
    const html =
      p % 4 === 1
        ? `<blockquote><p>${t}</p></blockquote>`
        : p % 4 === 2
          ? `<ul><li>${t}</li><li><em>more</em> ${p}</li></ul>`
          : p === 3
            ? `<h2>Part ${c}</h2>`
            : p === 7
              ? `<figure><img src="images/pic${c}.jpg" alt=""/><figcaption>${t}</figcaption></figure>`
              : `<p>${t}</p>`;
    out.push({
      html,
      text: t,
      words: p === 3 ? 2 : 50,
      ...(p === 7 ? { images: [{ path: `images/pic${c}.jpg` }] } : {}),
    } as WorkBlock);
  }
  return out;
}

function book(): WorkChapter[] {
  let before = 0;
  return [0, 1, 2].map((c) => {
    const b = blocks(c);
    const w = b.reduce((a, x) => a + x.words, 0);
    const ch: WorkChapter = {
      title: `Chapter ${c + 1}`,
      titled: true,
      kind: 'chapter',
      parentOrd: null,
      front: null,
      blocks: b,
      words: w,
      wordsBefore: before,
      imagePages: 0,
      pages: w / 250,
      priceCredits: 2,
    };
    before += w;
    return ch;
  });
}

interface El {
  tag: string;
  id: string | null;
  children: El[];
}

/** A small tree of the XHTML the sealer writes (well-formed, no comments or CDATA). */
function parse(xhtml: string): El {
  const root: El = { tag: '#document', id: null, children: [] };
  const stack = [root];
  for (const m of xhtml.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, close, tag, attrs, self] = m;
    if (close) {
      stack.pop();
      continue;
    }
    const el: El = { tag: tag!, id: /\bid="([^"]+)"/.exec(attrs!)?.[1] ?? null, children: [] };
    stack.at(-1)!.children.push(el);
    if (!self) stack.push(el);
  }
  return root;
}

/** CFI step paths (`/4/2/6…`, even indices for elements) of every element that has an id. */
function cfiPaths(xhtml: string): Map<string, { path: string; tag: string }> {
  const out = new Map<string, { path: string; tag: string }>();
  const walk = (el: El, path: string) =>
    el.children.forEach((c, i) => {
      const p = `${path}/${(i + 1) * 2}`;
      if (c.id) out.set(c.id, { path: p, tag: c.tag });
      walk(c, p);
    });
  walk(parse(xhtml), '');
  return out;
}

const bodyOf = (x: string) => x.slice(x.indexOf('<body'), x.lastIndexOf('</body>'));
const headOf = (x: string) => x.slice(0, x.indexOf('<body'));

async function seal(preview: {
  chapter: number;
  paragraph: number;
  words: number;
  percent: number;
  freeThrough: number;
}) {
  const master = newKey();
  let n = 0;
  const images = Object.fromEntries([0, 1, 2].map((c) => [`images/pic${c}.jpg`, new Uint8Array([c, 1, 2])]));
  const out = await sealBook({
    bookId: BOOK,
    revisionId: REV,
    title: 'Prefix',
    chapters: book(),
    images,
    preview,
    price: 6,
    pages: 3,
    masterKey: master,
    random: { uuid: () => `04230000-0000-4000-a000-${String(++n).padStart(12, '0')}` },
  });
  const keys = new Map<string | null, Uint8Array>();
  for (const k of out.keys)
    keys.set(k.chapter_uid, await unwrapKey(master, unb64(k.wrapped_key), keyLabel(REV, k.chapter_uid)));
  const read = (path: string, key: Uint8Array) =>
    openFile(key, out.files[path]!, chapterAad(REV, path)).then((b) => dec.decode(b));
  return { out, keys, read };
}

async function pairs(s: Awaited<ReturnType<typeof seal>>) {
  const kFree = s.keys.get(null)!;
  const res: { uid: string; free: string; full: string }[] = [];
  for (const c of (s.out as SealOutput).chapters) {
    if (!c.free_file) continue;
    res.push({
      uid: c.chapter_uid,
      free: await s.read(c.free_file, kFree),
      full: await s.read(c.full_file, s.keys.get(c.chapter_uid)!),
    });
  }
  return res;
}

describe('free files are structural prefixes of full files (CFIs work in both)', () => {
  it('in the chapter the preview cuts and in later chapters with a peek', async () => {
    const s = await seal({ chapter: 0, paragraph: 5, words: 252, percent: 15, freeThrough: -1 });
    const all = await pairs(s);
    expect(all.length).toBeGreaterThanOrEqual(1);
    for (const { free, full } of all) {
      // Same head (title, styles): the first CFI steps match.
      expect(headOf(free)).toBe(headOf(full));
      // The free body is the full body cut after a whole block.
      const fb = bodyOf(free);
      const lb = bodyOf(full);
      expect(lb.startsWith(fb)).toBe(true);
      expect(lb.length).toBeGreaterThan(fb.length);
      expect(lb[fb.length]).toBe('<');
      // Every element with an id in the free file sits at the same CFI path, with the same tag.
      const fp = cfiPaths(free);
      const lp = cfiPaths(full);
      expect(fp.size).toBeGreaterThan(0);
      for (const [id, at] of fp) expect(lp.get(id)).toEqual(at);
      // And the paragraphs after the cut only exist in the full file.
      expect([...lp.keys()].slice(0, fp.size)).toEqual([...fp.keys()]);
    }
  });

  it('holds wherever the cut falls, including right after a nested block or an image', async () => {
    for (const paragraph of [0, 1, 2, 7, 10]) {
      const s = await seal({
        chapter: 1,
        paragraph,
        words: 550 + paragraph * 50,
        percent: 30,
        freeThrough: 0,
      });
      const all = await pairs(s);
      expect(all.length).toBeGreaterThanOrEqual(1);
      for (const { free, full } of all) {
        expect(bodyOf(full).startsWith(bodyOf(free))).toBe(true);
        const lp = cfiPaths(full);
        for (const [id, at] of cfiPaths(free)) expect(lp.get(id)).toEqual(at);
      }
    }
  });
});
