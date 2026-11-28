// Word (.docx) to book HTML on the phone (docs/prd/12-book-pipeline.md rule 6). A streaming read
// of word/document.xml, so a long manuscript never becomes a DOM: paragraphs, heading styles
// (followed through `basedOn`), bold and italic, line breaks, centred lines and inline images.
// Blank paragraphs are dropped; a run of three or more between text becomes a scene break. The
// output goes through `normalizeHtml` and `sanitizeHtml` like every other converter's.
import { Parser } from 'htmlparser2';
import { resolvePath } from './epub';
import { imageType, safeUnzip } from './sanitize';

export class DocxError extends Error {}

export interface DocxResult {
  /** Body HTML: h1–h3, p, strong, em, br, img, scene-break divs. */
  html: string;
  /** Images by the path the HTML uses (`img/1.png`), checked by magic bytes. */
  images: Record<string, Uint8Array>;
}

interface Style {
  name: string;
  basedOn: string | null;
  outline: number | null;
  b: boolean | null;
  i: boolean | null;
}

const dec = new TextDecoder();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** `<w:b/>` is on; `w:val="0|false|off|none"` turns it off. */
const toggle = (attrs: Record<string, string>) => !/^(0|false|off|none)$/i.test(attrs['w:val'] ?? '');
/** Runs of blank paragraphs this long or longer are a scene break. */
const BLANK_BREAK = 3;

function readStyles(xml: string | null): Map<string, Style> {
  const styles = new Map<string, Style>();
  if (!xml) return styles;
  let cur: (Style & { id: string }) | null = null;
  let inRPr = false;
  const p = new Parser(
    {
      onopentag(name, a) {
        if (name === 'w:style') {
          cur = { id: a['w:styleId'] ?? '', name: '', basedOn: null, outline: null, b: null, i: null };
        } else if (!cur) return;
        else if (name === 'w:name') cur.name = (a['w:val'] ?? '').toLowerCase();
        else if (name === 'w:basedOn') cur.basedOn = a['w:val'] ?? null;
        else if (name === 'w:outlineLvl') cur.outline = Number(a['w:val']);
        else if (name === 'w:rPr') inRPr = true;
        else if (inRPr && name === 'w:b') cur.b = toggle(a);
        else if (inRPr && name === 'w:i') cur.i = toggle(a);
      },
      onclosetag(name) {
        if (name === 'w:rPr') inRPr = false;
        if (name === 'w:style' && cur) {
          if (cur.id) styles.set(cur.id, cur);
          cur = null;
        }
      },
    },
    { xmlMode: true },
  );
  p.end(xml);
  return styles;
}

/** Heading level 1–3 for a paragraph style, or 0. "Title" stays a paragraph (it is the title page). */
function headingLevel(styles: Map<string, Style>, id: string | null, outline: number | null): number {
  if (outline !== null && outline >= 0 && outline < 9) return Math.min(outline + 1, 3);
  for (let s = id ? styles.get(id) : undefined, n = 0; s && n < 8; s = styles.get(s.basedOn ?? ''), n++) {
    const m = s.name.match(/^heading\s*(\d)$/);
    if (m) return Math.min(Number(m[1]), 3);
    if (s.outline !== null && s.outline >= 0 && s.outline < 9) return Math.min(s.outline + 1, 3);
  }
  return 0;
}

function charStyle(styles: Map<string, Style>, id: string | null) {
  const out = { b: false, i: false };
  for (let s = id ? styles.get(id) : undefined, n = 0; s && n < 8; s = styles.get(s.basedOn ?? ''), n++) {
    if (s.name === 'strong') out.b = true;
    if (s.name === 'emphasis') out.i = true;
    if (s.b !== null) out.b ||= s.b;
    if (s.i !== null) out.i ||= s.i;
  }
  return out;
}

function readRels(xml: string | null): Map<string, string> {
  const rels = new Map<string, string>();
  if (!xml) return rels;
  const p = new Parser(
    {
      onopentag(name, a) {
        if (name === 'Relationship' && a.Id && a.Target && a.TargetMode !== 'External')
          rels.set(a.Id, a.Target);
      },
    },
    { xmlMode: true },
  );
  p.end(xml);
  return rels;
}

/** Elements whose content is never book text (deleted text, field codes, text boxes, fallbacks). */
const SKIP = new Set([
  'w:del',
  'w:delText',
  'w:instrText',
  'w:txbxContent',
  'mc:Fallback',
  'w:footnoteReference',
  'w:endnoteReference',
  'w:commentReference',
]);

export function docxToHtml(data: Uint8Array): DocxResult {
  let files: Record<string, Uint8Array>;
  try {
    files = safeUnzip(data);
  } catch (e) {
    throw new DocxError(`not a readable Word file: ${(e as Error).message}`);
  }
  const doc = files['word/document.xml'];
  if (!doc) throw new DocxError('not a Word file: word/document.xml is missing');
  const text = (path: string) => (files[path] ? dec.decode(files[path]) : null);
  const styles = readStyles(text('word/styles.xml'));
  const rels = readRels(text('word/_rels/document.xml.rels'));

  const images: Record<string, Uint8Array> = {};
  const imageByTarget = new Map<string, string>();
  const image = (relId: string | undefined) => {
    const target = relId ? rels.get(relId) : undefined;
    const path = target ? resolvePath('word', target.replace(/^\//, '../')) : null;
    if (!path) return '';
    let out = imageByTarget.get(path);
    if (!out) {
      const bytes = files[path];
      const type = bytes ? imageType(bytes) : null;
      if (!bytes || !type) return '';
      out = `img/${imageByTarget.size + 1}.${type === 'jpeg' ? 'jpg' : type}`;
      imageByTarget.set(path, out);
      images[out] = bytes;
    }
    return `<img src="${out}" alt=""/>`;
  };

  const out: string[] = [];
  let skip = 0;
  let inPPr = false;
  let inRun = false;
  let inRPr = false;
  let inText = false;
  let para: { style: string | null; outline: number | null; center: boolean; html: string } | null = null;
  let run = { b: false, i: false, style: null as string | null, text: '' };
  let blanks = 0;
  let written = false;

  const flushRun = () => {
    if (!para || !run.text) return;
    const cs = charStyle(styles, run.style);
    let h = run.text;
    if (run.i || cs.i) h = `<em>${h}</em>`;
    if (run.b || cs.b) h = `<strong>${h}</strong>`;
    para.html += h;
    run.text = '';
  };

  const flushPara = () => {
    if (!para) return;
    const body = para.html
      .replace(/<\/em><em>/g, '')
      .replace(/<\/strong><strong>/g, '')
      .replace(/(<br\/>)+$/, '');
    const plain = body.replace(/<[^>]*>/g, '').trim();
    const hasImg = body.includes('<img ');
    if (!plain && !hasImg) {
      blanks++;
      para = null;
      return;
    }
    const level = headingLevel(styles, para.style, para.outline);
    if (blanks >= BLANK_BREAK && written && !level) out.push('<div class="scene-break"></div>');
    blanks = 0;
    if (level) out.push(`<h${level}>${body.replace(/<br\/>/g, ' ').trim()}</h${level}>`);
    else out.push(`<p${para.center ? ' class="centered"' : ''}>${body}</p>`);
    written = true;
    para = null;
  };

  const parser = new Parser(
    {
      onopentag(name, a) {
        if (skip) {
          if (SKIP.has(name)) skip++;
          return;
        }
        if (SKIP.has(name)) {
          skip++;
          return;
        }
        switch (name) {
          case 'w:p':
            flushPara();
            para = { style: null, outline: null, center: false, html: '' };
            return;
          case 'w:pPr':
            inPPr = true;
            return;
          case 'w:r':
            inRun = true;
            run = { b: false, i: false, style: null, text: '' };
            return;
          case 'w:rPr':
            inRPr = true;
            return;
          case 'w:t':
            inText = inRun;
            return;
        }
        if (!para) return;
        if (inPPr && !inRPr) {
          if (name === 'w:pStyle') para.style = a['w:val'] ?? null;
          else if (name === 'w:outlineLvl') para.outline = Number(a['w:val']);
          else if (name === 'w:jc') para.center = a['w:val'] === 'center';
          return;
        }
        if (!inRun) return;
        if (inRPr) {
          if (name === 'w:b') run.b = toggle(a);
          else if (name === 'w:i') run.i = toggle(a);
          else if (name === 'w:rStyle') run.style = a['w:val'] ?? null;
          return;
        }
        if (name === 'w:tab') run.text += ' ';
        else if (name === 'w:noBreakHyphen') run.text += '-';
        else if (name === 'w:br' || name === 'w:cr') {
          if (a['w:type'] === 'page' || a['w:type'] === 'column') return;
          flushRun();
          para.html += '<br/>';
        } else if (name === 'a:blip') {
          flushRun();
          para.html += image(a['r:embed']);
        } else if (name === 'v:imagedata') {
          flushRun();
          para.html += image(a['r:id']);
        }
      },
      ontext(t) {
        if (!skip && inText) run.text += esc(t);
      },
      onclosetag(name) {
        if (skip) {
          if (SKIP.has(name)) skip--;
          return;
        }
        switch (name) {
          case 'w:t':
            inText = false;
            return;
          case 'w:rPr':
            inRPr = false;
            return;
          case 'w:pPr':
            inPPr = false;
            return;
          case 'w:r':
            flushRun();
            inRun = false;
            return;
          case 'w:p':
            flushPara();
            return;
        }
      },
    },
    { xmlMode: true, decodeEntities: true },
  );
  parser.end(dec.decode(doc));
  flushPara();
  return { html: out.join(''), images };
}
