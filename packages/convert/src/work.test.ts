import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { safeUnzip } from './sanitize';
import { assignAnchors } from './seal-book';
import { checkChapters, verifyPackage } from './verify';
import { FixError, applyFix, carryCopyright, copyrightAnchors, copyrightText, type WorkCopy } from './work';

const words = (n: number, w = 'word') => Array.from({ length: n }, () => w).join(' ');

async function work(): Promise<WorkCopy> {
  const chapters = {
    'c1.xhtml': `<h1>One</h1><p>${words(400)}</p><p>${words(400, 'cut')}</p>`,
    'c2.xhtml': `<p>A heading in disguise</p><p>${words(600)}</p>`,
    'c3.xhtml': `<h1>Three</h1><p>${words(800)}</p><p>${words(200, 'tail')}</p>`,
  };
  const names = Object.keys(chapters);
  const v = verifyPackage(
    safeUnzip(
      zipSync({
        'META-INF/container.xml': strToU8(
          '<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>',
        ),
        'content.opf': strToU8(
          `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest>${names.map((n, i) => `<item id="c${i}" href="${n}" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${names.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`,
        ),
        ...Object.fromEntries(
          names.map((n) => [n, strToU8(`<html><body>${chapters[n as keyof typeof chapters]}</body></html>`)]),
        ),
      }),
    ),
  );
  if (!v.ok) throw new Error(v.message);
  const anchors = await assignAnchors(v.chapters);
  return {
    v: 1,
    chapters: v.chapters,
    anchors,
    preview: v.preview,
    words: v.words,
    pages: v.pages,
    price: v.price,
  };
}

const sum = (w: WorkCopy) => w.chapters.reduce((a, c) => a + c.priceCredits, 0);

describe('applyFix', () => {
  it('renames a chapter by uid and keeps its uid', async () => {
    const w = await work();
    const uid = w.anchors.uids[1]!;
    const r = await applyFix(w, { op: 'rename_chapter', chapter_uid: uid, title: 'Two' });
    expect(r.work.chapters[1]).toMatchObject({ title: 'Two', titled: true });
    expect(r.work.anchors.uids[1]).toBe(uid);
    expect(r.touched).toEqual([uid]);
    expect(w.chapters[1]!.titled).toBe(false); // the input is not changed
  });

  it('makes a paragraph the chapter heading', async () => {
    const w = await work();
    const uid = w.anchors.uids[1]!;
    const para = w.anchors.ids[1]![0]!;
    const r = await applyFix(w, { op: 'set_heading', chapter_uid: uid, para_id: para });
    expect(r.work.chapters[1]!.title).toBe('A heading in disguise');
    expect(r.work.anchors.ids[1]).not.toContain(para);
    expect(r.work.chapters[1]!.blocks).toHaveLength(1);
    expect(r.work.words).toBe(w.words - 4);
    expect(checkChapters(r.work.chapters).map((f) => f.check_key)).not.toContain('chapter_title');
  });

  it('joins a chapter to the one above, keeping the upper uid and the paragraph ids', async () => {
    const w = await work();
    const [up, gone] = [w.anchors.uids[0]!, w.anchors.uids[1]!];
    const r = await applyFix(w, { op: 'merge_chapter_up', chapter_uid: gone });
    expect(r.work.chapters).toHaveLength(2);
    expect(r.work.anchors.uids).toEqual([up, w.anchors.uids[2]]);
    expect(r.work.anchors.ids[0]).toEqual([...w.anchors.ids[0]!, ...w.anchors.ids[1]!]);
    expect(r.touched).toEqual([up, gone]);
    expect(sum(r.work)).toBe(r.work.price);
    await expect(applyFix(w, { op: 'merge_chapter_up', chapter_uid: up })).rejects.toBeInstanceOf(FixError);
  });

  it('removes a paragraph and recounts the price', async () => {
    const w = await work();
    const uid = w.anchors.uids[2]!;
    const r = await applyFix(w, { op: 'remove_paragraph', chapter_uid: uid, para_id: w.anchors.ids[2]![0]! });
    expect(r.work.words).toBe(w.words - 800);
    expect(r.work.pages).toBe(Math.ceil(r.work.words / 250));
    expect(r.work.price).toBe(Math.ceil(r.work.pages / 2));
    expect(sum(r.work)).toBe(r.work.price);
    await expect(
      applyFix(r.work, { op: 'remove_paragraph', chapter_uid: uid, para_id: w.anchors.ids[2]![0]! }),
    ).rejects.toThrow('no longer');
  });

  it('inserts a copyright page at the front, priced 0, and clears the check', async () => {
    const w = await work();
    expect(checkChapters(w.chapters).map((f) => f.check_key)).toContain('copyright_missing');
    const r = await applyFix(w, {
      op: 'insert_copyright_page',
      text: copyrightText('Ifeoma Nwachukwu', 2026),
    });
    expect(r.work.chapters[0]).toMatchObject({
      title: 'Copyright',
      front: 'copyright',
      words: 0,
      priceCredits: 0,
    });
    expect(r.work.anchors.uids.slice(1)).toEqual(w.anchors.uids);
    expect(r.work.anchors.ids[0]).toHaveLength(1);
    expect(r.work.words).toBe(w.words);
    expect(sum(r.work)).toBe(r.work.price);
    expect(r.touched).toEqual([r.work.anchors.uids[0]]);
    expect(checkChapters(r.work.chapters).map((f) => f.check_key)).not.toContain('copyright_missing');
    await expect(applyFix(r.work, { op: 'insert_copyright_page', text: 'x' })).rejects.toBeInstanceOf(
      FixError,
    );
  });

  it('dismisses without changing the copy', async () => {
    const w = await work();
    const r = await applyFix(w, { op: 'dismiss_flag', reason: 'Intended' });
    expect(r).toEqual({ work: w, touched: [], restructured: false });
  });

  it('records a shrunk image size in every block that shows it; needs the size from the Worker', async () => {
    const w = await work();
    const img = { path: 'img/1.jpg', width: 3200, height: 4800, bytes: 3_000_000, alone: true };
    w.chapters[1]!.blocks.push({ html: '<img src="img/1.jpg"/>', text: '', words: 0, images: [img] });
    const size = { width: 1067, height: 1600, bytes: 400_000 };
    await expect(applyFix(w, { op: 'shrink_image', image: img.path })).rejects.toBeInstanceOf(FixError);
    await expect(applyFix(w, { op: 'shrink_image', image: 'img/9.png', size })).rejects.toBeInstanceOf(
      FixError,
    );
    const r = await applyFix(w, { op: 'shrink_image', image: img.path, size });
    expect(r.restructured).toBe(false);
    expect(r.touched).toEqual([w.anchors.uids[1]]);
    expect(r.work.chapters[1]!.blocks.at(-1)!.images).toEqual([{ ...img, ...size }]);
    expect(w.chapters[1]!.blocks.at(-1)!.images![0]).toBe(img); // the old copy is untouched
    expect(r.work.pages).toBe(w.pages);
  });
});

describe('copyrightAnchors', () => {
  it('gives a staff-added Copyright page the same uid and paragraph id in every revision of a book', async () => {
    const a = await copyrightAnchors('00000000-0000-4000-c000-000000000001');
    expect(await copyrightAnchors('00000000-0000-4000-c000-000000000001')).toEqual(a);
    expect((await copyrightAnchors('00000000-0000-4000-c000-000000000002')).chapter_uid).not.toBe(
      a.chapter_uid,
    );
    expect(a.chapter_uid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a.para_id).toMatch(/^p_[a-z2-7]{10}$/);
    const r = await applyFix(await work(), {
      op: 'insert_copyright_page',
      text: copyrightText('Ada', 2026),
      ...a,
    });
    expect([r.work.anchors.uids[0], r.work.anchors.ids[0]]).toEqual([a.chapter_uid, [a.para_id]]);
  });
});

describe('carryCopyright', () => {
  const withPage = async () =>
    (await applyFix(await work(), { op: 'insert_copyright_page', text: copyrightText('Ada', 2026) })).work;

  it("keeps the live revision's copyright page, uid and paragraph ids in an update without one", async () => {
    const live = await withPage();
    const update = await work();
    expect(checkChapters(update.chapters).map((f) => f.check_key)).toContain('copyright_missing');
    const next = carryCopyright(update, live)!;
    expect(next.chapters.map((c) => c.title)).toEqual(['Copyright', 'One', 'Chapter 2', 'Three']);
    expect(next.anchors.uids[0]).toBe(live.anchors.uids[0]);
    expect(next.anchors.ids[0]).toEqual(live.anchors.ids[0]);
    expect(next.anchors.uids.slice(1)).toEqual(update.anchors.uids);
    expect(next.price).toBe(update.price);
    expect(sum(next)).toBe(next.price);
    expect(checkChapters(next.chapters).map((f) => f.check_key)).not.toContain('copyright_missing');
    expect(update.chapters).toHaveLength(3); // the input is not changed
  });

  it('does nothing when the update has its own page or the live one has none', async () => {
    const live = await withPage();
    expect(carryCopyright(live, live)).toBeNull();
    expect(carryCopyright(await work(), await work())).toBeNull();
  });
});
