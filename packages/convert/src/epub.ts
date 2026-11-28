// Reading an unpacked EPUB: container → OPF → spine, and image sizes from file headers.
import { Element, Text, type ChildNode } from 'domhandler';
import { parseDocument } from 'htmlparser2';

const dec = new TextDecoder();

export interface SpineItem {
  href: string;
  mediaType: string;
}
export interface Opf {
  dir: string;
  spine: SpineItem[];
  /** All manifest items by href (package-relative). */
  items: Map<string, string>;
  coverHref: string | null;
  /** The EPUB 3 navigation document and the EPUB 2 NCX, when the package has them. */
  navHref: string | null;
  ncxHref: string | null;
}

const elements = (nodes: ChildNode[], name: string, out: Element[] = []): Element[] => {
  for (const n of nodes)
    if (n instanceof Element) {
      if (n.name === name || n.name.endsWith(`:${name}`)) out.push(n);
      elements(n.children, name, out);
    }
  return out;
};

/** Resolve `href` relative to directory `dir` inside the package; null if it leaves the package. */
export function resolvePath(dir: string, href: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(href.split('#')[0]!);
  } catch {
    return null; // a malformed %-escape points at nothing
  }
  const parts = (dir ? dir.split('/') : []).concat(path.split('/'));
  const out: string[] = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(p);
  }
  return out.join('/');
}

export function readOpf(files: Record<string, Uint8Array>): Opf {
  const container = files['META-INF/container.xml'];
  if (!container) throw new Error('missing container.xml');
  const rootfile = elements(parseDocument(dec.decode(container), { xmlMode: true }).children, 'rootfile')[0];
  const opfPath = rootfile?.attribs['full-path'];
  const opf = opfPath ? files[opfPath] : undefined;
  if (!opfPath || !opf) throw new Error('missing package document');
  const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';
  const doc = parseDocument(dec.decode(opf), { xmlMode: true });
  const byId = new Map<string, { href: string; type: string; props: string }>();
  const items = new Map<string, string>();
  for (const it of elements(doc.children, 'item')) {
    const href = resolvePath(dir, it.attribs.href ?? '');
    if (!href || !it.attribs.id) continue;
    byId.set(it.attribs.id, {
      href,
      type: it.attribs['media-type'] ?? '',
      props: it.attribs.properties ?? '',
    });
    items.set(href, it.attribs['media-type'] ?? '');
  }
  const spine = elements(doc.children, 'itemref')
    .map((r) => byId.get(r.attribs.idref ?? ''))
    .filter((x): x is { href: string; type: string; props: string } => !!x && /html/.test(x.type))
    .map((x) => ({ href: x.href, mediaType: x.type }));
  const metaCover = elements(doc.children, 'meta').find((m) => m.attribs.name === 'cover')?.attribs.content;
  const cover =
    [...byId.values()].find((x) => x.props.split(' ').includes('cover-image'))?.href ??
    (metaCover ? byId.get(metaCover)?.href : undefined) ??
    null;
  const tocId = elements(doc.children, 'spine')[0]?.attribs.toc;
  const navHref = [...byId.values()].find((x) => x.props.split(' ').includes('nav'))?.href ?? null;
  const ncxHref =
    (tocId ? byId.get(tocId)?.href : undefined) ??
    [...byId.values()].find((x) => x.type === 'application/x-dtbncx+xml')?.href ??
    null;
  return { dir, spine, items, coverHref: cover, navHref, ncxHref };
}

export interface Toc {
  /** Titles of the top-level entries, in order. */
  top: string[];
  /** Titles of every entry at any depth. */
  all: string[];
  /** Titles of the entries with nothing under them (a contents list that nests chapters under parts). */
  leaves: string[];
}

/**
 * The package's own contents list: the EPUB 3 `nav epub:type="toc"`, else the EPUB 2 NCX. Null
 * when there is none or it cannot be read (no contents list is not a fault).
 */
export function readToc(files: Record<string, Uint8Array>, opf: Opf): Toc | null {
  try {
    const nav = opf.navHref ? files[opf.navHref] : undefined;
    if (nav) {
      const doc = parseDocument(dec.decode(nav), { xmlMode: true });
      const navs = elements(doc.children, 'nav');
      const toc = navs.find((n) => /\btoc\b/.test(n.attribs['epub:type'] ?? '')) ?? navs[0];
      const list = toc && childElements(toc.children, 'ol')[0];
      if (list) {
        const toc: Toc = { top: [], all: [], leaves: [] };
        const walk = (ol: Element, depth: number) => {
          for (const li of childElements(ol.children, 'li')) {
            const label = childElements(li.children, 'a')[0] ?? childElements(li.children, 'span')[0];
            const subs = childElements(li.children, 'ol');
            add(toc, label ? textOf(label.children) : '', depth, subs.length === 0);
            for (const sub of subs) walk(sub, depth + 1);
          }
        };
        walk(list, 0);
        if (toc.all.length) return toc;
      }
    }
    const ncx = opf.ncxHref ? files[opf.ncxHref] : undefined;
    if (ncx) {
      const doc = parseDocument(dec.decode(ncx), { xmlMode: true });
      const map = elements(doc.children, 'navMap')[0];
      if (!map) return null;
      const toc: Toc = { top: [], all: [], leaves: [] };
      const walk = (el: Element, depth: number) => {
        for (const point of childElements(el.children, 'navPoint')) {
          const label = childElements(point.children, 'navLabel')[0];
          add(
            toc,
            label ? textOf(label.children) : '',
            depth,
            childElements(point.children, 'navPoint').length === 0,
          );
          walk(point, depth + 1);
        }
      };
      walk(map, 0);
      if (toc.all.length) return toc;
    }
  } catch {
    return null;
  }
  return null;
}

function add(toc: Toc, title: string, depth: number, leaf: boolean) {
  if (!title) return;
  toc.all.push(title);
  if (depth === 0) toc.top.push(title);
  if (leaf) toc.leaves.push(title);
}

const childElements = (nodes: ChildNode[], name: string): Element[] =>
  nodes.filter((n): n is Element => n instanceof Element && (n.name === name || n.name.endsWith(`:${name}`)));

/** Text of a parsed node tree, block elements separated by spaces. */
export function textOf(nodes: ChildNode[]): string {
  return nodes
    .map((n) => (n instanceof Text ? n.data : n instanceof Element ? ` ${textOf(n.children)} ` : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pixel size from a JPEG, PNG, GIF or WebP header; null if unreadable. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const u16be = (i: number) => (b[i]! << 8) | b[i + 1]!;
  const u16le = (i: number) => b[i]! | (b[i + 1]! << 8);
  const u32be = (i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
  if (b[0] === 0x89 && b[1] === 0x50 && b.length >= 24) return { width: u32be(16), height: u32be(20) };
  if (b[0] === 0x47 && b[1] === 0x49 && b.length >= 10) return { width: u16le(6), height: u16le(8) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      const len = u16be(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { width: u16be(i + 7), height: u16be(i + 5) };
      i += 2 + len;
    }
    return null;
  }
  if (b.length >= 30 && dec.decode(b.subarray(8, 12)) === 'WEBP') {
    const kind = dec.decode(b.subarray(12, 16));
    if (kind === 'VP8 ') return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (kind === 'VP8L') {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X')
      return {
        width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)),
        height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)),
      };
  }
  return null;
}
