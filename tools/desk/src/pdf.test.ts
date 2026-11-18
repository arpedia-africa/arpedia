import { describe, expect, it } from 'vitest';
import {
  parseBbox,
  pdfToHtml,
  SCANNED_CHARS_PER_PAGE,
  stripFurniture,
  textPerPage,
  type PdfPage,
} from './pdf';
import { reportFlags } from './report';

// A page as poppler's `pdftotext -bbox-layout` writes it: [size, x, y, text], y from the top.
type L = [number, number, number, string];
const xml = (pages: L[][]) =>
  `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "">` +
  `<html xmlns="http://www.w3.org/1999/xhtml"><head><title></title></head><body><doc>` +
  pages
    .map(
      (lines) =>
        `<page width="612.000000" height="792.000000"><flow><block>` +
        lines
          .map(([size, x, y, text]) => {
            let cx = x;
            const words = text.split(' ').map((w) => {
              const wx = cx;
              cx += w.length * size * 0.5 + size * 0.25;
              return `<word xMin="${wx}" yMin="${y}" xMax="${wx + w.length * size * 0.5}" yMax="${y + size}">${w
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')}</word>`;
            });
            return `<line xMin="${x}" yMin="${y}" xMax="${cx - size * 0.25}" yMax="${y + size}">${words.join('')}</line>`;
          })
          .join('') +
        `</block></flow></page>`,
    )
    .join('') +
  `</doc></body></html>`;

const full = 'The river ran past the old market where traders called out prices for yam';
const book: L[][] = [
  [
    [9, 72, 30, 'Market Day'],
    [24, 72, 110, 'Chapter One'],
    [12, 72, 160, full],
    [12, 72, 175, 'and pepper and cloth while the chil-'],
    [12, 72, 190, 'dren chased a goat & a hen.'],
    [12, 90, 205, 'Evening came slowly over the town and the lamps were lit along the road'],
    [12, 72, 220, full],
    [9, 300, 760, '1'],
  ],
  [
    [9, 72, 30, 'Market Day'],
    [12, 72, 80, 'past the stalls where the old woman sat.'],
    [12, 72, 110, '* * *'],
    [12, 72, 140, 'Morning came.'],
    [24, 72, 200, 'Chapter Two:'],
    [24, 72, 228, 'The River'],
    [12, 72, 270, full],
    [12, 72, 285, 'and it was late.'],
    [9, 300, 760, '2'],
  ],
  [
    [9, 72, 30, 'Market Day'],
    [12, 72, 80, 'The end.'],
    [9, 300, 760, 'iii'],
  ],
];

describe('parseBbox', () => {
  it('reads pages, lines, text and size', () => {
    const pages = parseBbox(xml(book));
    expect(pages).toHaveLength(3);
    expect(pages[0]!.lines[1]).toMatchObject({ text: 'Chapter One', size: 24, yMin: 110 });
    expect(pages[0]!.lines[4]!.text).toBe('dren chased a goat & a hen.');
  });
});

describe('pdfToHtml', () => {
  const pages = parseBbox(xml(book));

  it('drops running headers and page numbers', () => {
    const texts = stripFurniture(pages).flatMap((p) => p.lines.map((l) => l.text));
    expect(texts).not.toContain('Market Day');
    expect(texts).not.toContain('1');
    expect(texts).not.toContain('iii');
  });

  it('finds headings by size, joins wrapped lines, de-hyphenates and keeps scene breaks', () => {
    expect(pdfToHtml(pages).split('\n')).toEqual([
      '<h1>Chapter One</h1>',
      `<p>${full} and pepper and cloth while the children chased a goat &amp; a hen.</p>`,
      // indented first line starts a paragraph; a full last line carries over the page break
      `<p>Evening came slowly over the town and the lamps were lit along the road ${full} past the stalls where the old woman sat.</p>`,
      '<div class="scene-break"></div>',
      '<p>Morning came.</p>',
      '<h1>Chapter Two: The River</h1>',
      // a short last line ending a sentence closes the paragraph at the page break
      `<p>${full} and it was late.</p>`,
      '<p>The end.</p>',
    ]);
  });

  it('tells a scanned PDF by its text per page', () => {
    const scanned: PdfPage[] = [1, 2, 3].map(() => ({ width: 612, height: 792, lines: [] }));
    expect(textPerPage(scanned)).toBeLessThan(SCANNED_CHARS_PER_PAGE);
    expect(textPerPage(pages)).toBeGreaterThan(SCANNED_CHARS_PER_PAGE);
  });
});

describe('reportFlags', () => {
  it('turns epubcheck errors into file_check_error flags, once each, capped', () => {
    const err = (id: string, msg: string, path?: string, line?: number) => ({
      ID: id,
      severity: 'ERROR',
      message: msg,
      locations: path ? [{ path, line }] : [],
    });
    const flags = reportFlags({
      messages: [
        err('RSC-005', 'Error while parsing file: element "x" not allowed', 'OEBPS/c002.xhtml', 12),
        err('RSC-005', 'Error while parsing file: element "x" not allowed', 'OEBPS/c002.xhtml', 12),
        { ID: 'HTM-014', severity: 'WARNING', message: 'warning only' },
        { ID: 'PKG-008', severity: 'FATAL', message: 'Unable to read file', locations: [] },
        err('OPF-001', 'x'.repeat(700)),
      ],
    });
    expect(flags).toHaveLength(3);
    expect(flags[0]).toEqual({
      check_key: 'file_check_error',
      message: 'epubcheck RSC-005: Error while parsing file: element "x" not allowed (c002.xhtml, line 12)',
    });
    expect(flags[1]!.message).toBe('epubcheck PKG-008: Unable to read file');
    expect(flags[2]!.message).toHaveLength(500);
    const many = reportFlags({ messages: Array.from({ length: 300 }, (_, i) => err('E', `n${i}`)) });
    expect(many).toHaveLength(200);
  });
});
