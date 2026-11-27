// A small text-only PDF writer for statements (no dependency): A4 pages of positioned lines in
// Helvetica and Helvetica-Bold (WinAnsi). Characters outside Latin-1 become "?"; callers write
// money as "NGN" because the naira sign is not in the standard fonts.

export interface PdfLine {
  x: number;
  /** From the top of the page, in points. */
  y: number;
  text: string;
  size?: number;
  bold?: boolean;
  /** Right-align at x. */
  right?: boolean;
}

export const PAGE_W = 595;
export const PAGE_H = 842;

const latin1 = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
const esc = (s: string) => latin1(s).replace(/[\\()]/g, (ch) => `\\${ch}`);

// Helvetica widths (1/1000 em) for the ASCII range, enough to right-align numbers and labels.
const W =
  '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584'
    .split(',')
    .map(Number);

/** Approximate width of `text` in points (bold counts about 5% wider). */
export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of latin1(text)) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c < 127 ? W[c - 32]! : 556;
  }
  return (w / 1000) * size * (bold ? 1.05 : 1);
}

/** Cut `text` with "..." so it fits `max` points. */
export function fit(text: string, size: number, max: number, bold = false): string {
  if (textWidth(text, size, bold) <= max) return text;
  let t = text;
  while (t.length > 1 && textWidth(`${t}...`, size, bold) > max) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

function stream(lines: PdfLine[]): string {
  return lines
    .map((l) => {
      const size = l.size ?? 10;
      const x = l.right ? l.x - textWidth(l.text, size, l.bold) : l.x;
      return `BT /${l.bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${(PAGE_H - l.y).toFixed(2)} Td (${esc(l.text)}) Tj ET`;
    })
    .join('\n');
}

/** Build the PDF bytes for `pages` (each a list of lines). */
export function buildPdf(pages: PdfLine[][], title = 'Statement'): Uint8Array {
  const objs: string[] = [];
  const pageIds: number[] = [];
  // 1 catalog, 2 pages, 3 F1, 4 F2, 5 info, then a page and its content per page.
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objs[5] = `<< /Title (${esc(title)}) /Producer (Arpedia) >>`;
  (pages.length ? pages : [[]]).forEach((lines, i) => {
    const pid = 6 + i * 2;
    const content = stream(lines);
    objs[pid] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pid + 1} 0 R >>`;
    objs[pid + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    pageIds.push(pid);
  });
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  for (let n = 1; n < objs.length; n++) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objs[n]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objs.length; n++) out += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Every character is below 256, so one character is one byte.
  return Uint8Array.from(out, (ch) => ch.charCodeAt(0));
}
