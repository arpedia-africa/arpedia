// Hostile-input handling for author uploads (docs/prd/12-book-pipeline.md rule 10). The
// verification Worker runs every chapter through `sanitizeHtml` and every package through
// `safeUnzip`; nothing the phone sends is trusted. The phone runs the same code so the author's
// preview matches what the Worker will produce.
import { Element, Text, type ChildNode } from 'domhandler';
import { unzipSync } from 'fflate';
import { parseDocument } from 'htmlparser2';

const ALLOWED = new Set([
  'h1',
  'h2',
  'h3',
  'p',
  'em',
  'strong',
  'i',
  'b',
  'u',
  'blockquote',
  'ul',
  'ol',
  'li',
  'br',
  'hr',
  'img',
  'figure',
  'figcaption',
  'span',
  'div',
  'a',
]);
const VOID = new Set(['br', 'hr', 'img']);
/** Removed together with everything inside them. */
const DROP = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'select',
  'option',
  'textarea',
  'noscript',
  'template',
  'svg',
  'math',
  'head',
  'title',
  'meta',
  'link',
  'base',
  'audio',
  'video',
  'source',
  'track',
  'canvas',
  'portal',
]);
/** Classes the fixed template styles; any other class is dropped. */
export const ALLOWED_CLASSES = new Set([
  'scene-break',
  'centered',
  'right',
  'dropcap',
  'epigraph',
  'attribution',
  'poem',
  'verse',
  'small-caps',
  'front-matter',
  'chapter-title',
  'subtitle',
  'footnote',
  'caption',
]);
const ID = /^[A-Za-z][\w-]{0,63}$/;

export interface SanitizeReport {
  /** Elements removed with their content (script, iframe, form, …). */
  dropped: number;
  /** on* handlers, style attributes and other attributes removed. */
  attributes: number;
  /** Images or links pointing outside the package. */
  external: number;
}

export interface SanitizeOptions {
  /**
   * Maps an image `src` inside the package to its rebuilt path, or null to drop it. Remote and
   * data URLs never reach this; they are always dropped.
   */
  image?: (src: string) => string | null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;');

const isRemote = (url: string) => /^\s*([a-z][a-z0-9+.-]*:|\/\/)/i.test(url);
const isUnsafePath = (p: string) => p.startsWith('/') || p.split(/[\\/]/).includes('..');

/**
 * Keep only the allowlisted structure and rebuild it as XHTML. Headings h4–h6 become h3; unknown
 * elements are unwrapped (their text kept); links survive only to internal ids.
 */
export function sanitizeHtml(
  html: string,
  opts: SanitizeOptions = {},
): { html: string; report: SanitizeReport } {
  const report: SanitizeReport = { dropped: 0, attributes: 0, external: 0 };
  const doc = parseDocument(html, {
    decodeEntities: true,
    lowerCaseTags: true,
    lowerCaseAttributeNames: true,
  });

  const walk = (nodes: ChildNode[]): string =>
    nodes
      .map((n) => {
        if (n instanceof Text) return esc(n.data);
        if (!(n instanceof Element)) return ''; // comments, CDATA, processing instructions
        let tag = n.name;
        if (DROP.has(tag)) {
          report.dropped++;
          return '';
        }
        if (/^h[4-6]$/.test(tag)) tag = 'h3';
        if (tag === 'body' || tag === 'html' || !ALLOWED.has(tag)) return walk(n.children);

        const attrs: string[] = [];
        for (const [name, value] of Object.entries(n.attribs)) {
          if (name === 'id' && ID.test(value)) attrs.push(`id="${escAttr(value)}"`);
          else if (name === 'class' && (tag === 'span' || tag === 'div' || tag === 'p')) {
            const keep = value.split(/\s+/).filter((c) => ALLOWED_CLASSES.has(c));
            if (keep.length) attrs.push(`class="${keep.join(' ')}"`);
            if (keep.length !== value.split(/\s+/).filter(Boolean).length) report.attributes++;
          } else if (
            !(tag === 'img' && (name === 'src' || name === 'alt')) &&
            !(tag === 'a' && name === 'href')
          )
            report.attributes++;
        }

        if (tag === 'img') {
          const src = n.attribs.src ?? '';
          const mapped = isRemote(src) || isUnsafePath(src) || !src ? null : (opts.image?.(src) ?? null);
          if (!mapped) {
            report.external++;
            return '';
          }
          return `<img src="${escAttr(mapped)}" alt="${escAttr(n.attribs.alt ?? '')}"${attrs.length ? ' ' + attrs.join(' ') : ''}/>`;
        }
        if (tag === 'a') {
          const href = n.attribs.href ?? '';
          if (!/^#[A-Za-z][\w-]{0,63}$/.test(href)) {
            if (href) report.external++;
            return walk(n.children);
          }
          attrs.unshift(`href="${escAttr(href)}"`);
        }
        const open = `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}`;
        return VOID.has(tag) ? `${open}/>` : `${open}>${walk(n.children)}</${tag}>`;
      })
      .join('');

  return { html: walk(doc.children), report };
}

/** Image formats allowed in a book, checked by magic bytes (the file name is not trusted). */
export function imageType(b: Uint8Array): 'jpeg' | 'png' | 'gif' | 'webp' | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
  const ascii = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp';
  return null;
}

export const ZIP_MAX_ENTRIES = 5_000;
export const ZIP_MAX_BYTES = 300 * 1024 * 1024;
const NESTED = /\.(zip|epub|jar|rar|7z|gz|tgz|bz2|xz|tar|docx|odt)$/i;

export class UnsafeArchiveError extends Error {
  constructor(public readonly reason: 'too_many_entries' | 'too_large' | 'path' | 'nested') {
    super(`unsafe archive: ${reason}`);
    this.name = 'UnsafeArchiveError';
  }
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7);

/**
 * Unpack an EPUB or converted package: at most 5,000 entries and 300 MB expanded, no path that
 * leaves the package, no archive inside the archive.
 */
export function safeUnzip(data: Uint8Array): Record<string, Uint8Array> {
  let entries = 0;
  let declared = 0;
  const files = unzipSync(data, {
    filter: (f) => {
      if (++entries > ZIP_MAX_ENTRIES) throw new UnsafeArchiveError('too_many_entries');
      if (isUnsafePath(f.name) || /^[a-z]:/i.test(f.name) || f.name.includes('\0'))
        throw new UnsafeArchiveError('path');
      if (NESTED.test(f.name)) throw new UnsafeArchiveError('nested');
      declared += f.originalSize;
      if (declared > ZIP_MAX_BYTES) throw new UnsafeArchiveError('too_large');
      return true;
    },
  });
  let actual = 0;
  for (const [, bytes] of Object.entries(files)) {
    actual += bytes.length;
    if (actual > ZIP_MAX_BYTES) throw new UnsafeArchiveError('too_large');
    if (isZip(bytes)) throw new UnsafeArchiveError('nested');
  }
  return files;
}
