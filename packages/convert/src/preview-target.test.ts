import { previewTarget } from '@arpedia/core';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { safeUnzip } from './sanitize';
import { verifyPackage } from './verify';
import { applyEdits, applyFix, type WorkCopy } from './work';

// Flow 12 · 12-11: the cut computed at verify (and kept through the author's edits and staff
// fixes) aims at the book's own preview percent, not a fixed 10%.
const para = (n: number) => `<p>${Array.from({ length: n }, () => 'word').join(' ')}</p>`;
const chapter = (t: string) => `<h1>${t}</h1>${Array.from({ length: 20 }, () => para(100)).join('')}`;

function pkg() {
  const names = ['c1.xhtml', 'c2.xhtml', 'c3.xhtml', 'c4.xhtml', 'c5.xhtml'];
  const opf = `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest>
    ${names.map((n, i) => `<item id="c${i}" href="${n}" media-type="application/xhtml+xml"/>`).join('')}
    </manifest><spine>${names.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`;
  return safeUnzip(
    zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8(
        '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
      ),
      'OEBPS/content.opf': strToU8(opf),
      ...Object.fromEntries(
        names.map((n, i) => [
          `OEBPS/${n}`,
          strToU8(`<html><body>${chapter(`Chapter ${i + 1}`)}</body></html>`),
        ]),
      ),
    }),
  );
}

function work(percent: number): WorkCopy {
  const v = verifyPackage(pkg(), { previewPercent: percent });
  if (!v.ok) throw new Error('verify failed');
  return {
    v: 1,
    chapters: v.chapters,
    anchors: {
      uids: v.chapters.map((_, i) => `u${i}`),
      ids: v.chapters.map((c) => c.blocks.map((_, j) => `p${j}`)),
      fps: v.chapters.map((c) => c.blocks.map(() => 'f')),
    } as unknown as WorkCopy['anchors'],
    preview: v.preview,
    words: v.words,
    pages: v.pages,
    price: v.price,
    previewPercent: percent,
  };
}

describe('preview target (12-11)', () => {
  it('reads a valid override and falls back to 10% otherwise', () => {
    expect(previewTarget(20)).toBe(20);
    expect(previewTarget('7.5')).toBe(7.5);
    expect(previewTarget(null)).toBe(10);
    expect(previewTarget(undefined)).toBe(10);
    expect(previewTarget(0)).toBe(10);
    expect(previewTarget(40)).toBe(10);
    expect(previewTarget('')).toBe(10);
  });

  it('verify cuts at the book percent', () => {
    expect(work(10).preview.percent).toBeCloseTo(10, 0);
    expect(work(20).preview.percent).toBeCloseTo(20, 0);
    expect(work(20).preview.words).toBe(2000);
  });

  it("the author's chapter edits keep the book percent", () => {
    const next = applyEdits(work(20), [{ op: 'rename', ord: 1, title: 'Two' }]);
    expect(next.preview.words).toBe(2000);
  });

  it('a staff fix keeps the book percent', async () => {
    const w = work(25);
    const { work: next } = await applyFix(w, { op: 'merge_chapter_up', chapter_uid: 'u4' });
    expect(next.preview.words).toBe(2500);
  });

  it('an older work copy without a stored percent keeps the 10% default', () => {
    const w = work(10);
    delete w.previewPercent;
    expect(applyEdits(w, []).preview.words).toBe(1000);
  });
});
