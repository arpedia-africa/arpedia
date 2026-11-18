// PDF text → book HTML (docs/prd/12-book-pipeline.md rule 21). Input is poppler's
// `pdftotext -bbox-layout` output: pages of lines with word boxes. The heuristics:
//   - drop running headers and footers (the same text at the top or bottom of many pages) and page numbers
//   - detect headings by size (a line clearly taller than the body text)
//   - join hard-wrapped lines into paragraphs; a paragraph ends at a gap, an indent or a short line
//   - de-hyphenate words broken across lines
import { Element, type ChildNode } from 'domhandler';
import { parseDocument } from 'htmlparser2';

export interface PdfLine {
  text: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Median word height, which tracks the font size. */
  size: number;
}
export interface PdfPage {
  width: number;
  height: number;
  lines: PdfLine[];
}

const children = (nodes: ChildNode[], name: string) =>
  nodes.filter((n): n is Element => n instanceof Element && n.name === name);
const all = (nodes: ChildNode[], name: string, out: Element[] = []): Element[] => {
  for (const n of nodes)
    if (n instanceof Element) {
      if (n.name === name) out.push(n);
      else all(n.children, name, out);
    }
  return out;
};
const num = (el: Element, k: string) => Number(el.attribs[k] ?? 0);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};
const textOf = (el: Element): string =>
  el.children.map((c) => ('data' in c ? String(c.data) : c instanceof Element ? textOf(c) : '')).join('');

/** Parse `pdftotext -bbox-layout` XHTML into pages and lines. */
export function parseBbox(xhtml: string): PdfPage[] {
  const doc = parseDocument(xhtml, { xmlMode: true, decodeEntities: true });
  return all(doc.children, 'page').map((page) => ({
    width: num(page, 'width'),
    height: num(page, 'height'),
    lines: all(page.children, 'line')
      .map((line) => {
        const words = children(line.children, 'word');
        return {
          text: words.map(textOf).join(' ').replace(/\s+/g, ' ').trim(),
          xMin: num(line, 'xMin'),
          xMax: num(line, 'xMax'),
          yMin: num(line, 'yMin'),
          yMax: num(line, 'yMax'),
          size: median(words.map((w) => num(w, 'yMax') - num(w, 'yMin'))),
        };
      })
      .filter((l) => l.text)
      .sort((a, b) => a.yMin - b.yMin || a.xMin - b.xMin),
  }));
}

/** Characters of text per page, to tell a scanned PDF (no text layer) from a real one. */
export function textPerPage(pages: PdfPage[]): number {
  if (!pages.length) return 0;
  return pages.reduce((a, p) => a + p.lines.reduce((b, l) => b + l.text.length, 0), 0) / pages.length;
}
/** Under this many characters a page on average, the PDF is treated as scanned. */
export const SCANNED_CHARS_PER_PAGE = 100;

const PAGE_NUMBER = /^(?:page\s+)?(?:\d{1,4}|[ivxlcdm]{1,7})(?:\s+of\s+\d{1,4})?$/i;
const SCENE_BREAK = /^(?:(?:\*\s*){1,5}|#|(?:~\s*){1,5}|⁂)$/;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const shape = (s: string) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

/** Remove running headers, footers and page numbers. */
export function stripFurniture(pages: PdfPage[]): PdfPage[] {
  const zone = (p: PdfPage, l: PdfLine) =>
    l.yMax <= p.height * 0.1 ? 'top' : l.yMin >= p.height * 0.9 ? 'bottom' : null;
  const seen = new Map<string, number>();
  for (const p of pages) {
    const keys = new Set(p.lines.flatMap((l) => (zone(p, l) ? [`${zone(p, l)}|${shape(l.text)}`] : [])));
    for (const k of keys) seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const repeated = Math.max(2, Math.ceil(pages.length * 0.3));
  return pages.map((p) => ({
    ...p,
    lines: p.lines.filter((l) => {
      const z = zone(p, l);
      if (!z) return true;
      if (PAGE_NUMBER.test(l.text.trim())) return false;
      return (seen.get(`${z}|${shape(l.text)}`) ?? 0) < repeated;
    }),
  }));
}

/** Book HTML (<h1> headings, <p> paragraphs, scene breaks) from PDF pages. */
export function pdfToHtml(input: PdfPage[]): string {
  const pages = stripFurniture(input);
  const lines = pages.flatMap((p, pi) => p.lines.map((l) => ({ ...l, page: pi })));
  if (!lines.length) return '';

  // Body size: the size most of the text is set in (weighted by characters).
  const bySize = new Map<number, number>();
  for (const l of lines) {
    const k = Math.round(l.size * 2) / 2;
    bySize.set(k, (bySize.get(k) ?? 0) + l.text.length);
  }
  const body = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const isHeading = (l: PdfLine) =>
    l.size >= body * 1.25 && l.text.length <= 80 && l.text.split(' ').length <= 12;
  const bodyLines = lines.filter((l) => !isHeading(l));
  const left = median(bodyLines.map((l) => l.xMin));
  const right = median(bodyLines.map((l) => l.xMax));
  const leading =
    median(
      bodyLines
        .slice(1)
        .flatMap((l, i) => (l.page === bodyLines[i]!.page ? [l.yMin - bodyLines[i]!.yMin] : [])),
    ) || body * 1.2;

  const out: string[] = [];
  let para = '';
  let heading = '';
  const flushPara = () => {
    if (para.trim()) out.push(`<p>${esc(para.trim())}</p>`);
    para = '';
  };
  const flushHeading = () => {
    if (heading.trim()) out.push(`<h1>${esc(heading.trim())}</h1>`);
    heading = '';
  };

  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    const text = l.text.trim();
    if (isHeading(l)) {
      flushPara();
      // A heading set on two lines (same size, right below) is one heading.
      const joins = prev && heading && isHeading(prev) && prev.page === l.page && l.yMin - prev.yMax < l.size;
      if (!joins) flushHeading();
      heading += (heading ? ' ' : '') + text;
      return;
    }
    flushHeading();
    if (SCENE_BREAK.test(text)) {
      flushPara();
      out.push('<div class="scene-break"></div>');
      return;
    }
    const startsNew =
      !para ||
      !prev ||
      isHeading(prev) ||
      (prev.page === l.page && l.yMin - prev.yMin > leading * 1.5) ||
      l.xMin > left + body * 0.8 ||
      (prev.xMax < right - (right - left) * 0.15 && /[.!?:"'”’)]$/.test(prev.text.trim()));
    if (startsNew) {
      flushPara();
      para = text;
    } else if (/\p{L}-$/u.test(para) && /^\p{Ll}/u.test(text)) para = para.slice(0, -1) + text;
    else para += ' ' + text;
  });
  flushPara();
  flushHeading();
  return out.join('\n');
}
