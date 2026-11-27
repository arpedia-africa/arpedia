import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readOpf, readToc } from './epub';
import { safeUnzip } from './sanitize';
import { checkChapters, storyChapterCount, verifyPackage } from './verify';
import { applyEdits, type WorkCopy } from './work';

const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
const para = (n: number) => `<p>${words(n)}</p>`;
const nav = (entries: string) =>
  `<html xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="landmarks"><ol><li><a href="a">Start</a></li></ol></nav>` +
  `<nav epub:type="toc"><ol>${entries}</ol></nav></body></html>`;
const li = (t: string, sub = '') => `<li><a href="x.xhtml">${t}</a>${sub ? `<ol>${sub}</ol>` : ''}</li>`;

function pkg(chapters: Record<string, string>, toc?: { nav?: string; ncx?: string }) {
  const names = Object.keys(chapters);
  const opf = `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest>
    ${names.map((n, i) => `<item id="c${i}" href="${n}" media-type="application/xhtml+xml"/>`).join('')}
    ${toc?.nav ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : ''}
    ${toc?.ncx ? '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' : ''}
    </manifest><spine${toc?.ncx ? ' toc="ncx"' : ''}>${names.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`;
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
      ...(toc?.nav ? { 'OEBPS/nav.xhtml': strToU8(toc.nav) } : {}),
      ...(toc?.ncx ? { 'OEBPS/toc.ncx': strToU8(toc.ncx) } : {}),
    }),
  );
}

const long = Array.from({ length: 40 }, () => para(250)).join('');
const keys = (r: ReturnType<typeof verifyPackage>) => (r.ok ? r.flags.map((f) => f.check_key) : []);
const three = {
  'copy.xhtml': `<h1>Copyright</h1><p>© 2026 Ifeoma.</p>`,
  'c1.xhtml': `<h1>One</h1>${para(500)}`,
  'c2.xhtml': `<h1>Two</h1>${para(500)}`,
  'c3.xhtml': `<h1>Three</h1>${para(500)}`,
};

describe('contents list (rule 24: chapter_detection_failed, toc_mismatch)', () => {
  it('reads the EPUB 3 toc nav, not the landmarks, with nested entries', () => {
    const files = pkg(three, {
      nav: nav(li('Copyright') + li('Part one', li('One') + li('Two')) + li('Three')),
    });
    expect(readToc(files, readOpf(files))).toEqual({
      top: ['Copyright', 'Part one', 'Three'],
      all: ['Copyright', 'Part one', 'One', 'Two', 'Three'],
      leaves: ['Copyright', 'One', 'Two', 'Three'],
    });
  });

  it('reads the EPUB 2 NCX when there is no nav', () => {
    const point = (t: string, sub = '') =>
      `<navPoint><navLabel><text>${t}</text></navLabel>${sub}</navPoint>`;
    const files = pkg(three, {
      ncx: `<ncx><navMap>${point('One')}${point('Two', point('Two A'))}</navMap></ncx>`,
    });
    expect(readToc(files, readOpf(files))).toEqual({
      top: ['One', 'Two'],
      all: ['One', 'Two', 'Two A'],
      leaves: ['One', 'Two A'],
    });
  });

  it('no contents list, or an unreadable one, is not a fault', () => {
    const r = verifyPackage(pkg(three));
    expect(r.ok && r.tocChapters).toBeNull();
    expect(keys(r)).not.toContain('toc_mismatch');
    const broken = pkg(three, { nav: '<html><body><p>no nav here</p></body></html>' });
    expect(readToc(broken, readOpf(broken))).toBeNull();
  });

  it('a contents list that matches the chapters raises nothing; front matter entries are left out', () => {
    const r = verifyPackage(
      pkg(three, { nav: nav(li('Cover') + li('Copyright') + li('One') + li('Two') + li('Three')) }),
    );
    expect(r.ok && r.tocChapters).toEqual([3]);
    expect(keys(r)).not.toContain('toc_mismatch');
    expect(keys(r)).not.toContain('chapter_detection_failed');
  });

  it('a contents list that nests chapters under parts matches at either depth', () => {
    const r = verifyPackage(
      pkg(three, { nav: nav(li('Part one', li('One') + li('Two')) + li('Part two', li('Three'))) }),
    );
    expect(r.ok && r.tocChapters).toEqual([2, 3, 5]);
    expect(keys(r)).not.toContain('toc_mismatch');
    const off = verifyPackage(
      pkg(three, { nav: nav(li('Part one', li('One')) + li('Part two', li('Two'))) }),
    );
    expect(keys(off)).toContain('toc_mismatch'); // 2 parts, 2 chapters, 4 entries: none is 3
  });

  it('flags a different chapter count with both numbers', () => {
    const r = verifyPackage(pkg(three, { nav: nav(li('One') + li('Two') + li('Three') + li('Four')) }));
    const f = r.ok ? r.flags.find((x) => x.check_key === 'toc_mismatch') : undefined;
    expect(f?.message).toBe('The contents list has 4 chapters, but we found 3 in the text.');
    expect(f?.location).toBeUndefined(); // book level: replaced on every rescore
  });

  it('blocks a book whose contents list names chapters the text has no headings for', () => {
    const r = verifyPackage(pkg({ 'all.xhtml': long }, { nav: nav(li('One') + li('Two') + li('Three')) }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.untitledBook).toBe(true);
    expect(r.chapters.length).toBeGreaterThan(1); // split into parts, counted as one chapter
    expect(storyChapterCount(r.chapters)).toBe(1);
    expect(keys(r)).toContain('chapter_detection_failed');
    expect(keys(r)).not.toContain('toc_mismatch');
    expect(r.flags.find((f) => f.check_key === 'chapter_detection_failed')?.message).toBe(
      'The contents list names 3 chapters, but we could not find where they start in the text.',
    );
  });

  it('a book with no chapters and no contents list is split into parts without a flag (flow 11 rule 19)', () => {
    const r = verifyPackage(pkg({ 'all.xhtml': long }));
    expect(keys(r)).not.toContain('chapter_detection_failed');
  });

  it('a one-entry contents list is not a chapter list', () => {
    const r = verifyPackage(pkg({ 'all.xhtml': long }, { nav: nav(li('Start')) }));
    expect(keys(r)).not.toContain('chapter_detection_failed');
  });

  it('rechecks after the author merges a chapter up, so the flag follows the chapter list', () => {
    const r = verifyPackage(pkg(three, { nav: nav(li('One') + li('Two')) }));
    if (!r.ok) throw new Error('verify failed');
    expect(keys(r)).toContain('toc_mismatch');
    const work: WorkCopy = {
      v: 1,
      chapters: r.chapters,
      anchors: {
        uids: r.chapters.map((_, i) => `u${i}`),
        ids: r.chapters.map((c) => c.blocks.map((_, j) => `p${j}`)),
        fps: r.chapters.map((c) => c.blocks.map(() => 'f')),
      } as unknown as WorkCopy['anchors'],
      preview: r.preview,
      words: r.words,
      pages: r.pages,
      price: r.price,
      untitledBook: r.untitledBook,
      tocChapters: r.tocChapters,
    };
    const merged = applyEdits(work, [{ op: 'merge_up', ord: 3 }]);
    const flags = checkChapters(merged.chapters, {
      untitledBook: merged.untitledBook,
      tocChapters: merged.tocChapters,
    });
    expect(flags.map((f) => f.check_key)).not.toContain('toc_mismatch');
  });
});
