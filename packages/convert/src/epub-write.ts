// EPUB3 writer for converted books (docs/prd/12-book-pipeline.md section D; the phone's converter
// in flow 11 uses it too). Input is sanitised XHTML split into chapters at each <h1>; output is a
// package epubcheck accepts: stored `mimetype` first, container, OPF with dcterms:modified, a nav
// document outside the spine, one XHTML file per chapter.
import { strToU8, zipSync, type Zippable } from 'fflate';
import { imageType } from './sanitize';

export interface EpubInput {
  title: string;
  language: string;
  author?: string;
  /** Stable identifier, e.g. `urn:uuid:<revision id>`. */
  identifier: string;
  /** Sanitised XHTML body content (see `sanitizeHtml`); split at every top-level <h1>. */
  html: string;
  /** Images by the path the HTML uses (`img/1.png`). */
  images?: Record<string, Uint8Array>;
  /** For dcterms:modified; defaults to now. */
  modified?: Date;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MEDIA = { jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' } as const;

const xhtml = (title: string, lang: string, body: string, nav = false) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"` +
  `${nav ? ' xmlns:epub="http://www.idpf.org/2007/ops"' : ''} xml:lang="${esc(lang)}" lang="${esc(lang)}">` +
  `<head><meta charset="utf-8"/><title>${esc(title)}</title></head><body>${body}</body></html>\n`;

/** Split body XHTML into chapters at each <h1>; text before the first heading is its own file. */
export function splitAtHeadings(html: string): { title: string | null; html: string }[] {
  return html
    .split(/(?=<h1[\s>])/)
    .filter((part) => part.replace(/<[^>]*>/g, '').trim() || /<img\s/.test(part))
    .map((part) => {
      const h = part.match(/^<h1[^>]*>([\s\S]*?)<\/h1>/);
      const title = h
        ? h[1]!
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim()
        : null;
      return { title: title || null, html: part };
    });
}

/** Links to ids that are not in the same file would break once split; keep their text only. */
const localLinks = (html: string) => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  return html.replace(/<a href="#([^"]+)">([\s\S]*?)<\/a>/g, (m, id: string, inner: string) =>
    ids.has(id) ? m : inner,
  );
};

export function writeEpub(input: EpubInput): Uint8Array {
  const lang = input.language || 'en';
  const chapters = splitAtHeadings(input.html);
  if (!chapters.length) chapters.push({ title: null, html: '<p></p>' });
  const files: Zippable = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(
      '<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
        '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n',
    ),
  };
  const manifest: string[] = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
  ];
  const spine: string[] = [];
  const nav: string[] = [];
  chapters.forEach((c, i) => {
    const name = `c${String(i + 1).padStart(3, '0')}.xhtml`;
    const title = c.title ?? (i === 0 ? input.title : `Section ${i + 1}`);
    files[`OEBPS/${name}`] = strToU8(xhtml(title, lang, localLinks(c.html)));
    manifest.push(`<item id="c${i + 1}" href="${name}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="c${i + 1}"/>`);
    nav.push(`<li><a href="${name}">${esc(title)}</a></li>`);
  });
  Object.entries(input.images ?? {}).forEach(([path, bytes], i) => {
    const type = imageType(bytes);
    if (!type) return;
    files[`OEBPS/${path}`] = [bytes, { level: 0 }];
    manifest.push(`<item id="img${i + 1}" href="${esc(path)}" media-type="${MEDIA[type]}"/>`);
  });
  files['OEBPS/nav.xhtml'] = strToU8(
    xhtml(
      'Contents',
      lang,
      `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${nav.join('')}</ol></nav>`,
      true,
    ),
  );
  const modified = (input.modified ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');
  files['OEBPS/content.opf'] = strToU8(
    `<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${esc(lang)}">` +
      `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${esc(input.identifier)}</dc:identifier>` +
      `<dc:title>${esc(input.title)}</dc:title><dc:language>${esc(lang)}</dc:language>` +
      (input.author ? `<dc:creator>${esc(input.author)}</dc:creator>` : '') +
      `<meta property="dcterms:modified">${modified}</meta></metadata>` +
      `<manifest>${manifest.join('')}</manifest><spine>${spine.join('')}</spine></package>\n`,
  );
  return zipSync(files);
}
