import { countWords } from '@arpedia/core';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { imageSize } from './epub';
import { safeUnzip } from './sanitize';
import { verifyPackage } from './verify';

const words = (n: number, w = 'word') => Array.from({ length: n }, () => w).join(' ');
const para = (n: number) => `<p>${words(n)}</p>`;
const png = (w: number, h: number) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};

function epub(chapters: Record<string, string>, extra: Record<string, Uint8Array> = {}) {
  const names = Object.keys(chapters);
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest>
    ${names.map((n, i) => `<item id="c${i}" href="${n}" media-type="application/xhtml+xml"/>`).join('')}
    <item id="map" href="img/map.png" media-type="image/png"/>
    <item id="cover" href="img/cover.png" media-type="image/png" properties="cover-image"/>
    </manifest><spine>${names.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`;
  return safeUnzip(
    zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8(
        '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
      ),
      'OEBPS/content.opf': strToU8(opf),
      ...Object.fromEntries(
        names.map((n) => [`OEBPS/${n}`, strToU8(`<html><body>${chapters[n]}</body></html>`)]),
      ),
      'OEBPS/img/map.png': png(1200, 1800),
      'OEBPS/img/cover.png': png(600, 900),
      ...extra,
    }),
  );
}

describe('verifyPackage', () => {
  it('keeps escaped markup in bare text escaped, and drops an image with a broken %-escape', () => {
    const r = verifyPackage(
      epub({ 'c.xhtml': `&lt;img src=x onerror=alert(1)&gt; ${words(1200)}<p><img src="pic%zz.png"/></p>` }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const html = r.chapters.flatMap((c) => c.blocks.map((b) => b.html)).join('');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(Object.keys(r.images)).toEqual([]);
  });

  it('rebuilds chapters, counts words, prices and places the preview', () => {
    const r = verifyPackage(
      epub({
        'copy.xhtml': `<h1>Copyright</h1><p>© 2026 Ifeoma. ${words(40)}</p>`,
        'ch1.xhtml': `<h1>One</h1>${para(300)}${para(300)}<script>alert(1)</script>${para(400)}`,
        'ch2.xhtml': `<h2>Two</h2><p onclick="x()">${words(500)}</p><div class="scene-break"></div>${para(1500)}
                      <figure><img src="img/map.png"/></figure><img src="https://evil.example/x.png"/>`,
        'ch3.xhtml': `${para(1000)}`,
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.chapters.map((c) => [c.title, c.front, c.words])).toEqual([
      ['Copyright', 'copyright', 0],
      ['One', null, 1000],
      ['Two', null, 2000],
      ['Chapter 4', null, 1000],
    ]);
    expect(r.words).toBe(4000);
    expect(r.pages).toBe(16 + 1); // 4,000 ÷ 250 + one full-page image
    expect(r.price).toBe(9);
    expect(r.chapters.reduce((a, c) => a + c.priceCredits, 0)).toBe(9);
    expect(r.chapters[0]!.priceCredits).toBe(0);
    expect(r.preview).toMatchObject({ chapter: 1, paragraph: 0, words: 300 });
    const html = r.chapters.flatMap((c) => c.blocks.map((b) => b.html)).join('');
    expect(html).not.toMatch(/script|onclick|evil/);
    expect(html).toContain('<img src="img/1.png" alt=""/>');
    expect(Object.keys(r.images)).toEqual(['img/1.png']);
    // the 1,200 × 1,800 map is over 1,600 px; the 600 px cover is under 800
    expect(r.flags.map((f) => f.check_key).sort()).toEqual([
      'chapter_title',
      'cover_too_small',
      'image_too_large',
    ]);
    expect(r.flags.find((f) => f.check_key === 'chapter_title')).toMatchObject({
      location: { chapter_ord: 3 },
    });
  });

  it('splits a book with no chapters into parts', () => {
    const all = Array.from({ length: 24 }, (_, i) => `<p>${words(500, `w${i}`)}</p>`).join('');
    const r = verifyPackage(epub({ 'all.xhtml': all }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.chapters.map((c) => c.title)).toEqual(['Part 1', 'Part 2', 'Part 3']);
    expect(r.chapters.every((c) => c.kind === 'part' && c.words <= 5000)).toBe(true);
    expect(r.flags.map((f) => f.check_key)).toEqual(['copyright_missing', 'cover_too_small']);
  });

  it('finds chapters inside one converted Word file and flags short books', () => {
    const r = verifyPackage(
      epub({ 'book.xhtml': `<p>Chapter 1</p>${para(200)}<p>Chapter 2</p>${para(200)}` }),
    );
    expect(r.ok && r.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2']);
    expect(r.ok && r.flags.map((f) => f.check_key)).toContain('too_short');
  });

  it('sends unreadable packages back', () => {
    expect(verifyPackage({ 'x.txt': strToU8('hello') })).toMatchObject({ ok: false, reason: 'unreadable' });
  });

  it('reads image sizes from headers', () => {
    expect(imageSize(png(640, 960))).toEqual({ width: 640, height: 960 });
    expect(countWords(words(3))).toBe(3);
  });
});
