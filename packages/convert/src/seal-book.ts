// Sealing (docs/prd/12-book-pipeline.md rules 16–17, flow 04 A.2–A.7): paragraph ids, chapter
// uids, per-chapter encryption, free files, package files and the plaintext manifest. Pure apart
// from randomness: the Worker writes the returned files under books/{rev}/g{generation}/.
import {
  type BasePara,
  type BookManifest,
  alignParagraphs,
  chapterAad,
  fingerprint,
  freeParagraphs,
  keyLabel,
  matchChapters,
  newKey,
  newParaId,
  sealFile,
  wrapKey,
  type PreviewCut,
} from '@arpedia/core';
import type { WorkChapter } from './verify';

export interface BaseChapter {
  chapter_uid: string;
  title: string;
  paragraphs: BasePara[];
}

export interface SealInput {
  bookId: string;
  revisionId: string;
  /** Book title for the package metadata. */
  title: string;
  chapters: WorkChapter[];
  images: Record<string, Uint8Array>;
  preview: PreviewCut;
  price: number;
  pages: number;
  masterKey: Uint8Array;
  /** The live revision this one updates, for keeping paragraph ids and chapter uids. */
  base?: BaseChapter[];
  /** Fixed randomness for tests. */
  random?: { uuid?: () => string; paraId?: () => string };
  /**
   * Keys to keep when a live revision is sealed again (preview rebuild): K_free and the chapter keys
   * by chapter uid, so copies already on phones still open. Chapters without one get a new key.
   */
  keys?: { free?: Uint8Array; chapters: Record<string, Uint8Array> };
}

export interface SealedAnchor {
  para_id: string;
  chapter_uid: string;
  ord: number;
  fingerprint: string;
  words: number;
  words_before: number;
}

export interface SealOutput {
  /** Files relative to the generation prefix; everything but manifest.json is encrypted. */
  files: Record<string, Uint8Array>;
  manifest: BookManifest;
  chapters: { chapter_uid: string; free_file: string | null; full_file: string }[];
  keys: { chapter_uid: string | null; wrapped_key: string }[];
  anchors: SealedAnchor[];
  anchor_migrations: { old_para_id: string; new_para_id: null; nearest_para_id: string; method: 'nearest' }[];
  prices: { chapter_uid: string; price_credits: number }[];
}

const enc = new TextEncoder();
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));

/** Give a block's root element the paragraph id (replacing any id it had). */
const withId = (html: string, id: string) =>
  html.replace(/^<([a-z0-9]+)((?:\s[^>]*?)?)(\/?)>/, (_m, tag: string, attrs: string, slash: string) => {
    const rest = attrs.replace(/\sid="[^"]*"/, '');
    return `<${tag} id="${id}"${rest}${slash}>`;
  });

const xhtml = (title: string, body: string) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${esc(title)}</title><link rel="stylesheet" href="style.css"/></head><body>${body}</body></html>`;

export const BOOK_CSS = `body{margin:0}p{margin:0 0 .8em}h1{font-size:1.4em}h2,h3{font-size:1.15em}
.scene-break{text-align:center;margin:1.2em 0}.scene-break::before{content:"* * *"}
.centered{text-align:center}.right{text-align:right}.small-caps{font-variant:small-caps}
figure{margin:1em 0;text-align:center}img{max-width:100%;height:auto}`;

/** One chapter's reader files (rule 17): the full and free XHTML and the images they use. */
export function chapterFiles(
  c: Pick<WorkChapter, 'title' | 'blocks'>,
  ord: number,
  ids: string[],
  freeCount: number,
): { full: string; free: string; images: { src: string; target: string; free: boolean }[] } {
  const imgMap = new Map<string, string>();
  const freeImages = new Set<string>();
  const blocks = c.blocks.map((b, j) => {
    let html = withId(b.html, ids[j]!);
    for (const img of b.images ?? []) {
      const target =
        imgMap.get(img.path) ?? `img/c${ord}-${imgMap.size + 1}${img.path.slice(img.path.lastIndexOf('.'))}`;
      imgMap.set(img.path, target);
      if (j < freeCount) freeImages.add(img.path);
      html = html.split(`src="${img.path}"`).join(`src="${target}"`);
    }
    return html;
  });
  const heading = `<h1>${esc(c.title)}</h1>`;
  return {
    full: xhtml(c.title, heading + blocks.join('')),
    free: xhtml(c.title, heading + blocks.slice(0, Math.max(0, freeCount)).join('')),
    images: [...imgMap].map(([src, target]) => ({ src, target, free: freeImages.has(src) })),
  };
}

/** The package files every book carries (container, OPF, contents, style sheet). */
export function packageFiles(
  bookId: string,
  title: string,
  chapters: { title: string }[],
): Record<string, string> {
  const spine = chapters.map((_, ord) => `<itemref idref="c${ord}"/>`).join('');
  const items = chapters
    .map((_, ord) => `<item id="c${ord}" href="c${ord}.full.xhtml" media-type="application/xhtml+xml"/>`)
    .join('');
  return {
    'META-INF/container.xml':
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'content.opf': `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:${bookId}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${items}</manifest><spine>${spine}</spine></package>`,
    'nav.xhtml': xhtml(
      'Contents',
      `<nav epub:type="toc"><ol>${chapters.map((c, ord) => `<li><a href="c${ord}.full.xhtml">${esc(c.title)}</a></li>`).join('')}</ol></nav>`,
    ),
    'style.css': BOOK_CSS,
  };
}

export interface BookAnchors {
  /** chapter_uid per chapter. */
  uids: string[];
  /** Paragraph id per block, per chapter. */
  ids: string[][];
  /** Fingerprint per block, per chapter. */
  fps: string[][];
  migrations: SealOutput['anchor_migrations'];
}

/**
 * Chapter uids and paragraph ids (rule 16): matched chapters keep their uid, aligned paragraphs keep
 * their id, the rest are new. Runs at verify time, so the ids are fixed before chapters are confirmed.
 */
export async function assignAnchors(
  chapters: WorkChapter[],
  base: BaseChapter[] = [],
  random: SealInput['random'] = {},
): Promise<BookAnchors> {
  const uuid = random.uuid ?? (() => crypto.randomUUID());
  const paraId = random.paraId ?? (() => newParaId());
  const fps = await Promise.all(
    chapters.map((c) => Promise.all(c.blocks.map((b) => fingerprint(b.text || b.html)))),
  );
  const matched = matchChapters(
    base.map((b) => ({ title: b.title, fps: b.paragraphs.map((p) => p.fp) })),
    chapters.map((c, i) => ({ title: c.title, fps: fps[i]! })),
  );
  const migrations: SealOutput['anchor_migrations'] = [];
  const ids = chapters.map((c, i) => {
    const m = matched[i];
    const next = c.blocks.map((b, j) => ({ fp: fps[i]![j]!, text: b.text || b.html }));
    if (m === null || m === undefined) return next.map(() => paraId());
    const a = alignParagraphs(base[m]!.paragraphs, next, paraId);
    migrations.push(...a.migrations);
    return a.ids;
  });
  return { uids: matched.map((m) => (m === null ? uuid() : base[m]!.chapter_uid)), ids, fps, migrations };
}

export async function sealBook(input: SealInput & { anchors?: BookAnchors }): Promise<SealOutput> {
  const { chapters, preview, revisionId } = input;
  const { uids, ids, fps, migrations } =
    input.anchors ?? (await assignAnchors(chapters, input.base, input.random));

  // ─── Keys ─────────────────────────────────────────────────────────────────
  const kFree = input.keys?.free ?? newKey();
  const keyOf = chapters.map((_, ord) =>
    ord <= preview.freeThrough ? null : (input.keys?.chapters[uids[ord]!] ?? newKey()),
  );
  const free = freeParagraphs(
    chapters.map((c) => c.blocks.map((b) => (c.front ? 0 : b.words))),
    preview,
  );

  const files: Record<string, Uint8Array> = {};
  const put = async (path: string, key: Uint8Array, bytes: Uint8Array) => {
    files[path] = await sealFile(key, bytes, chapterAad(revisionId, path));
  };

  // ─── Chapters and their images ────────────────────────────────────────────
  const out: SealOutput['chapters'] = [];
  const anchors: SealedAnchor[] = [];
  let paraOrd = 0;
  const manifestChapters: BookManifest['chapters'] = [];
  for (const [ord, c] of chapters.entries()) {
    const key = keyOf[ord];
    const cf = chapterFiles(c, ord, ids[ord]!, free[ord]!);
    const full = `c${ord}.full.xhtml`;
    const partial = key && free[ord]! >= 0 ? `c${ord}.free.xhtml` : null;
    await put(full, key ?? kFree, enc.encode(cf.full));
    if (partial) await put(partial, kFree, enc.encode(cf.free));
    for (const img of cf.images)
      await put(img.target, key && !img.free ? key : kFree, input.images[img.src] ?? new Uint8Array());
    out.push({ chapter_uid: uids[ord]!, free_file: partial, full_file: full });

    let before = 0;
    const paragraphs = c.blocks.map((b, j) => {
      const p = { id: ids[ord]![j]!, words_before: c.wordsBefore + before };
      anchors.push({
        para_id: p.id,
        chapter_uid: uids[ord]!,
        ord: paraOrd++,
        fingerprint: fps[ord]![j]!,
        words: c.front ? 0 : b.words,
        words_before: p.words_before,
      });
      before += c.front ? 0 : b.words;
      return p;
    });
    manifestChapters.push({
      chapter_uid: uids[ord]!,
      ord,
      kind: c.kind,
      parent_ord: c.parentOrd,
      title: c.title,
      words: c.words,
      words_before: c.wordsBefore,
      pages: c.pages,
      price_credits: c.priceCredits,
      free_file: key ? partial : null,
      full_file: full,
      images: cf.images.length,
      paragraphs,
    });
  }

  // ─── Package files (K_free) ───────────────────────────────────────────────
  for (const [path, text] of Object.entries(packageFiles(input.bookId, input.title, chapters)))
    await put(path, kFree, enc.encode(text));

  const cutChapter = manifestChapters[preview.chapter]!;
  const manifest: BookManifest = {
    schema_version: 1,
    book_id: input.bookId,
    revision_id: revisionId,
    total_words: chapters.reduce((a, c) => a + c.words, 0),
    pages: input.pages,
    price_credits: input.price,
    preview_cut: {
      chapter_uid: cutChapter.chapter_uid,
      para_id: cutChapter.paragraphs[preview.paragraph]!.id,
      percent: preview.percent,
    },
    cipher: { alg: 'AES-GCM', key_bits: 256 },
    chapters: manifestChapters,
  };
  files['manifest.json'] = enc.encode(JSON.stringify(manifest));

  const keys: SealOutput['keys'] = [
    {
      chapter_uid: null,
      wrapped_key: b64(await wrapKey(input.masterKey, kFree, keyLabel(revisionId, null))),
    },
  ];
  for (const [ord, k] of keyOf.entries())
    if (k)
      keys.push({
        chapter_uid: uids[ord]!,
        wrapped_key: b64(await wrapKey(input.masterKey, k, keyLabel(revisionId, uids[ord]!))),
      });

  return {
    files,
    manifest,
    chapters: out,
    keys,
    anchors,
    anchor_migrations: migrations,
    prices: chapters.map((c, ord) => ({ chapter_uid: uids[ord]!, price_credits: c.priceCredits })),
  };
}
