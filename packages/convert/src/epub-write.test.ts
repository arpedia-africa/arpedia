import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readOpf } from './epub';
import { splitAtHeadings, writeEpub } from './epub-write';
import { normalizeHtml, normalizeText } from './normalize';
import { safeUnzip } from './sanitize';
import { verifyPackage } from './verify';

const png = () => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, 400);
  new DataView(b.buffer).setUint32(20, 300);
  return b;
};
const para = (n: number) => `<p>${Array.from({ length: n }, () => 'word').join(' ')}</p>`;

describe('normalizeText / normalizeHtml', () => {
  it('curls quotes, makes dashes and ellipses', () => {
    expect(normalizeText(`"Come," she said -- "it's late..."`)).toBe('“Come,” she said — “it’s late…”');
    expect(normalizeText("'Ada' left")).toBe('‘Ada’ left');
  });

  it('keeps markup, carries quote context across inline tags and resets at blocks', () => {
    expect(normalizeHtml('<p>"<em>Hi</em>"</p><p>"Yes"</p>')).toBe('<p>“<em>Hi</em>”</p><p>“Yes”</p>');
    expect(normalizeHtml('<p class="x">It&#39;s &quot;ok&quot;</p>')).toBe('<p class="x">It’s “ok”</p>');
  });

  it('turns scene-break paragraphs into the marker', () => {
    for (const mark of ['* * *', '***', '#', '~~~', '- - -'])
      expect(normalizeHtml(`<p>a</p><p> ${mark} </p><p>b</p>`)).toBe(
        '<p>a</p><div class="scene-break"></div><p>b</p>',
      );
    expect(normalizeHtml('<p>* not a break</p>')).toBe('<p>* not a break</p>');
  });
});

describe('writeEpub', () => {
  const html =
    para(30) +
    `<h1 id="one">Chapter One</h1>${para(600)}<p><a href="#one">back</a> <a href="#two">next</a></p>` +
    `<h1>Chapter Two</h1>${para(600)}<p><img src="img/1.png" alt=""/></p>`;
  const bytes = writeEpub({
    title: 'Market & Day',
    language: 'en',
    author: 'Obiageli',
    identifier: 'urn:uuid:00000000-0000-0000-0000-000000000001',
    html,
    images: { 'img/1.png': png() },
    modified: new Date('2026-11-18T10:00:00.123Z'),
  });

  it('splits at each <h1>, keeping text before the first heading', () => {
    expect(splitAtHeadings(html).map((c) => c.title)).toEqual([null, 'Chapter One', 'Chapter Two']);
  });

  it('writes a package with mimetype stored first and nav outside the spine', () => {
    const raw = unzipSync(bytes);
    expect(Object.keys(raw)[0]).toBe('mimetype');
    expect(strFromU8(raw.mimetype!)).toBe('application/epub+zip');
    const opf = strFromU8(raw['OEBPS/content.opf']!);
    expect(opf).toContain('<meta property="dcterms:modified">2026-11-18T10:00:00Z</meta>');
    expect(opf).toContain('<dc:title>Market &amp; Day</dc:title>');
    expect(opf).toContain('media-type="image/png"');
    const { spine } = readOpf(safeUnzip(bytes));
    expect(spine.map((s) => s.href)).toEqual(['OEBPS/c001.xhtml', 'OEBPS/c002.xhtml', 'OEBPS/c003.xhtml']);
    // a link to an id in another file keeps only its text
    const one = strFromU8(raw['OEBPS/c002.xhtml']!);
    expect(one).toContain('<a href="#one">back</a> next');
  });

  it('reads back through verifyPackage with the same chapters and image', () => {
    const res = verifyPackage(safeUnzip(bytes));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter One', 'Chapter Two']);
    expect(Object.keys(res.images)).toEqual(['img/1.png']);
  });
});
