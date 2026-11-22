// The reader bundle (flow 04 A, D–I): foliate-js over a loader that asks native for every file.
// No network, no keys, no tokens here. Native decrypts and decides which file (free or full) a
// chapter gets; this side draws, reports positions and selections, and holds forward moves at gates.
import { EPUB } from 'foliate-js/epub.js';
import 'foliate-js/view.js';
import { Overlayer } from 'foliate-js/overlayer.js';
import {
  indexParagraphs,
  pageAt,
  positionToPercent,
  wordsLeftInChapter,
  type ChapterAccess,
  type ReadingManifest,
} from '@arpedia/core/reading';
import {
  BRIDGE_VERSION,
  HIGHLIGHT_COLORS,
  parseFromNative,
  type DrawAnnotation,
  type Gate,
  type GateRoom,
  type NativeToWeb,
  type ReaderSettings,
  type RelocateDetail,
  type WebToNative,
} from '../protocol';
import type { Rect } from '../placement';
import { bookCss } from './styles';

declare const __BUNDLE_VERSION__: string;
declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(s: string): void };
  }
}

// foliate's custom element, loosely typed (the package ships no types).
interface FoliateView extends HTMLElement {
  book: Book;
  renderer: Renderer;
  lastLocation: { cfi: string; range: Range } | null;
  open(book: Book): Promise<void>;
  close(): void;
  init(o: { lastLocation?: string | null }): Promise<void>;
  goTo(t: unknown): Promise<unknown>;
  next(): Promise<void>;
  prev(): Promise<void>;
  addAnnotation(a: { value: string }, remove?: boolean): Promise<unknown>;
  deleteAnnotation(a: { value: string }): Promise<unknown>;
  getCFI(index: number, range: Range): string;
  resolveNavigation(t: unknown): { index: number; anchor?: (doc: Document) => Range | Element } | undefined;
  deselect(): void;
  search(o: { query: string; index?: number }): AsyncGenerator<unknown>;
  clearSearch(): void;
}
interface Section {
  id: string;
  linear?: string;
  unload?: () => void;
  createDocument?: () => Promise<Document>;
}
interface Book {
  sections: Section[];
  toc?: { label: string; href: string }[];
}
interface Renderer extends HTMLElement {
  page: number;
  pages: number;
  start: number;
  end: number;
  viewSize: number;
  atEnd: boolean;
  scrolled: boolean;
  getContents(): { index: number; doc: Document; overlayer?: Overlayer }[];
  setStyles(css: string | [string, string]): void;
  nextSection(): Promise<void>;
  prevSection(): Promise<void>;
}

// ─── Messaging ───────────────────────────────────────────────────────────────
let seq = 0;
const nextId = () => `w${++seq}`;
function post(m: WebToNative & { id?: string }) {
  window.ReactNativeWebView?.postMessage(JSON.stringify({ v: BRIDGE_VERSION, ...m }));
}
const log = (message: string, level: 'info' | 'warn' = 'info') =>
  post({ type: 'log', payload: { level, message } });

const pendingFiles = new Map<
  string,
  { resolve: (b: Uint8Array | null) => void; reject: (e: Error) => void }
>();
const pendingAdvance = new Map<string, (d: { allow: boolean; reason?: string }) => void>();

function requestFile(path: string): Promise<Uint8Array | null> {
  const id = nextId();
  return new Promise((resolve, reject) => {
    pendingFiles.set(id, { resolve, reject });
    post({ type: 'resource.request', id, payload: { path } });
  });
}

const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const decoder = new TextDecoder();

// Optional package files foliate probes for; they don't exist in our books.
const OPTIONAL = /^META-INF\/(encryption|com\.apple|com\.kobobooks|calibre)/;

/** Strip anything executable before foliate renders it (flow 12 sanitises too; defence in depth). */
function scrub(text: string, path: string): string {
  if (!/\.x?html$/.test(path)) return text;
  return text
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
}

const loader = {
  loadText: async (path: string) => {
    if (OPTIONAL.test(path)) return null;
    const bytes = await requestFile(path);
    return bytes ? scrub(decoder.decode(bytes), path) : null;
  },
  loadBlob: async (path: string) => {
    const bytes = await requestFile(path);
    if (!bytes) throw new Error(`missing ${path}`);
    return new Blob([bytes.slice().buffer]);
  },
  getSize: () => 0,
};

// ─── State ───────────────────────────────────────────────────────────────────
let view: FoliateView | null = null;
let book: Book | null = null;
let manifest: ReadingManifest | null = null;
let paraIndex: ReturnType<typeof indexParagraphs> = new Map();
let access: Record<string, ChapterAccess> = {};
let settings: ReaderSettings | null = null;
let gateRoom: GateRoom = { preview: 0, chapter: 0 };
const annotations = new Map<string, DrawAnnotation>(); // by cfi_range
let markers: { para_id: string; count: number }[] = [];
let currentIndex = -1;
let advanceInFlight = false;
let lastRelocate: RelocateDetail | null = null;

const chapterAt = (index: number) => manifest?.chapters.find((c) => c.ord === index) ?? null;
const isGated = (index: number) => {
  const c = chapterAt(index);
  const a = c ? access[c.chapter_uid] : undefined;
  return a === 'partial' || a === 'locked';
};
const gateFor = (index: number): Gate | null => {
  const c = chapterAt(index);
  if (!c || !isGated(index)) return null;
  return { kind: access[c.chapter_uid] === 'partial' ? 'preview' : 'chapter', chapter_uid: c.chapter_uid };
};

/**
 * Hold the reader at the first gate at or after the open section: every later section becomes
 * non-linear, so foliate's own page turns and swipes stop at the gate's last page (rule 51).
 */
function applyGates() {
  if (!book) return;
  let gated = false;
  book.sections.forEach((s, i) => {
    s.linear = gated && i > currentIndex ? 'no' : 'yes';
    if (i >= currentIndex && isGated(i)) gated = true;
  });
}

// ─── Geometry ────────────────────────────────────────────────────────────────
function frameOffset(doc: Document) {
  const fe = doc.defaultView?.frameElement as HTMLElement | null;
  const r = fe?.getBoundingClientRect();
  return { x: r?.left ?? 0, y: r?.top ?? 0 };
}
function toViewport(doc: Document, r: DOMRect): Rect {
  const o = frameOffset(doc);
  return { x: r.left + o.x, y: r.top + o.y, w: r.width, h: r.height };
}
/** One box per line: union the client rects that share a line. */
function lineRects(doc: Document, range: Range): Rect[] {
  const lines: Rect[] = [];
  for (const r of Array.from(range.getClientRects())) {
    if (r.width < 1 || r.height < 1) continue;
    const v = toViewport(doc, r);
    const same = lines.find((l) => Math.abs(l.y - v.y) < v.h / 2);
    if (same) {
      const x2 = Math.max(same.x + same.w, v.x + v.w);
      const y2 = Math.max(same.y + same.h, v.y + v.h);
      same.x = Math.min(same.x, v.x);
      same.y = Math.min(same.y, v.y);
      same.w = x2 - same.x;
      same.h = y2 - same.y;
    } else lines.push(v);
  }
  const W = window.innerWidth;
  return lines.filter((l) => l.x + l.w > 0 && l.x < W);
}

// ─── Positions ───────────────────────────────────────────────────────────────
function paraOf(node: Node | null): Element | null {
  let el: Node | null = node;
  while (el && el.nodeType !== 1) el = el.parentNode;
  for (let e = el as Element | null; e; e = e.parentElement) if (e.id && paraIndex.has(e.id)) return e;
  return null;
}
const countWords = (s: string) => (s.match(/\S+/g) ?? []).length;
function wordsInto(para: Element, node: Node, offset: number): number {
  const r = para.ownerDocument.createRange();
  r.setStart(para, 0);
  try {
    r.setEnd(node, offset);
  } catch {
    return 0;
  }
  return countWords(r.toString());
}

function gateTop(doc: Document): number | null {
  const g = doc.querySelector('[data-arp-gate]');
  if (!g) return null;
  const r = g.getBoundingClientRect();
  const v = toViewport(doc, r);
  return v.x >= 0 && v.x < window.innerWidth && v.y < window.innerHeight ? v.y : null;
}

function onRelocate(loc: { cfi: string; range: Range }) {
  // While opening or reopening, foliate passes through the section start: not a real place.
  if (!manifest || !view || settling) return;
  const contents = view.renderer.getContents()[0];
  const index = contents?.index ?? currentIndex;
  const chapter = chapterAt(index);
  // A page with no paragraph start on it (the tail of a long paragraph, the gate room) keeps the
  // place of the page before it in this chapter, so percent never steps back.
  const own = paraOf(loc.range.startContainer);
  const carried = !own && lastRelocate?.chapter_uid === chapter?.chapter_uid ? lastRelocate : null;
  const startPara =
    own ?? (carried?.para_id ? (contents?.doc.getElementById(carried.para_id) ?? null) : null);
  const endPara = paraOf(loc.range.endContainer);
  const offset = carried
    ? carried.offset
    : startPara
      ? wordsInto(startPara, loc.range.startContainer, loc.range.startOffset)
      : 0;
  const pos = {
    chapter_uid: chapter?.chapter_uid ?? '',
    para_id: startPara?.id ?? chapter?.paragraphs[0]?.id ?? '',
    offset_words: offset,
  };
  const r = view.renderer;
  const atFirst = r.scrolled ? r.start < 2 : r.page <= 1;
  const atEnd = r.atEnd;
  const gate = atEnd ? gateFor(index) : null;
  const last = manifest.chapters[manifest.chapters.length - 1];
  const detail: RelocateDetail = {
    cfi: loc.cfi,
    para_id: startPara?.id ?? null,
    offset,
    chapter_uid: chapter?.chapter_uid ?? null,
    start_para: startPara?.id ?? null,
    end_para: endPara?.id ?? null,
    percent: positionToPercent(manifest, pos),
    page: pageAt(manifest, pos).page,
    words_left_in_chapter: wordsLeftInChapter(manifest, pos),
    at_first_page_of_chapter: atFirst,
    at_last_page_of_book: atEnd && !gate && !!last && chapter?.chapter_uid === last.chapter_uid,
    at_gate: gate,
    gate_top: gate && contents ? gateTop(contents.doc) : null,
  };
  lastRelocate = detail;
  post({ type: 'relocate', payload: detail });
}

// ─── Forward moves at a gate (rules 51–55) ───────────────────────────────────
function atGateNow(): Gate | null {
  if (!view) return null;
  return view.renderer.atEnd ? gateFor(currentIndex) : null;
}

async function forward() {
  if (!view) return;
  const gate = atGateNow();
  if (!gate) return view.next();
  if (advanceInFlight) return;
  advanceInFlight = true;
  const id = nextId();
  const decision = await new Promise<{ allow: boolean; reason?: string }>((resolve) => {
    pendingAdvance.set(id, resolve);
    post({
      type: 'advance.request',
      id,
      payload: { from_chapter_uid: gate.chapter_uid, gate_kind: gate.kind },
    });
  });
  advanceInFlight = false;
  // On allow, native has already sent access.update (the section is reloaded with its full file).
  if (decision.allow) await reopened.then(() => view?.next());
}

// ─── Section setup ───────────────────────────────────────────────────────────
const fontFaces = () =>
  (document.head.querySelector('style')?.textContent ?? '').replace(/html,body\{[\s\S]*$/, '');

function decorate(doc: Document, index: number) {
  // Fonts declared on the page don't reach blob: section documents; give each its own copy.
  if (!doc.getElementById('arp-fonts')) {
    const st = doc.createElement('style');
    st.id = 'arp-fonts';
    st.textContent = fontFaces();
    doc.head?.append(st);
  }
  const c = chapterAt(index);
  const h = doc.querySelector('body > h1, h1');
  if (h && c && c.kind === 'chapter') {
    const n = manifest!.chapters.filter((x) => x.kind === 'chapter' && x.ord <= c.ord).length;
    h.setAttribute('data-arp-label', `Chapter ${n}`);
  }
  // Room for the native card at a gate: appended last, so no earlier CFI changes.
  const gate = gateFor(index);
  const room = gate ? (gate.kind === 'preview' ? gateRoom.preview : gateRoom.chapter) : 0;
  doc.querySelector('[data-arp-gate]')?.remove();
  if (room > 0) {
    const g = doc.createElement('div');
    g.setAttribute('data-arp-gate', gate!.kind);
    g.style.height = `${room}px`;
    doc.body.append(g);
  }
  watchSelection(doc);
  watchTaps(doc);
}

// ─── Selection (rules 28–31): report only after the finger lifts and 250 ms of calm ──
const MAX_SELECTION = 1000;
function watchSelection(doc: Document) {
  let fingerDown = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastKey = '';
  let reported = false;
  const settle = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (fingerDown) return;
      const sel = doc.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        if (reported) post({ type: 'selection.cleared' });
        reported = false;
        lastKey = '';
        return;
      }
      let range = sel.getRangeAt(0);
      let text = range.toString();
      let clipped = false;
      if (text.length > MAX_SELECTION) {
        range = clipRange(doc, range, MAX_SELECTION);
        sel.removeAllRanges();
        sel.addRange(range);
        text = range.toString();
        clipped = true;
      }
      if (!text.trim()) return;
      const key = `${text.length}:${text.slice(0, 40)}`;
      if (key === lastKey && reported) return;
      lastKey = key;
      reported = true;
      const index = view?.renderer.getContents()[0]?.index ?? currentIndex;
      const fe = doc.defaultView?.frameElement as HTMLElement | null;
      const page = fe?.parentElement?.getBoundingClientRect();
      post({
        type: 'selection',
        payload: {
          cfi_range: view!.getCFI(index, range),
          text: text.slice(0, 500),
          para_id_start: paraOf(range.startContainer)?.id ?? null,
          para_id_end: paraOf(range.endContainer)?.id ?? null,
          chapter_uid: chapterAt(index)?.chapter_uid ?? null,
          rects: lineRects(doc, range),
          page_rect: { x: 0, y: page?.top ?? 0, w: window.innerWidth, h: window.innerHeight },
          clipped,
        },
      });
    }, 250);
  };
  const down = () => {
    fingerDown = true;
    clearTimeout(timer);
  };
  const up = () => {
    fingerDown = false;
    settle();
  };
  doc.addEventListener('touchstart', down, { passive: true });
  doc.addEventListener('pointerdown', down);
  doc.addEventListener('touchend', up);
  doc.addEventListener('touchcancel', up);
  doc.addEventListener('pointerup', up);
  doc.addEventListener('selectionchange', settle);
  // No native copy menu or long-press callout (rule 28).
  doc.addEventListener('contextmenu', (e) => e.preventDefault());
}

function clipRange(doc: Document, range: Range, max: number): Range {
  const out = doc.createRange();
  out.setStart(range.startContainer, range.startOffset);
  const walker = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  let left = max;
  let started = false;
  for (let n = walker.currentNode as Node | null; n; n = walker.nextNode()) {
    if (n.nodeType !== 3) continue;
    if (!started) {
      if (n !== range.startContainer && !range.intersectsNode(n)) continue;
      started = true;
    }
    const from = n === range.startContainer ? range.startOffset : 0;
    const len = (n.textContent ?? '').length - from;
    if (len >= left) {
      out.setEnd(n, from + left);
      return out;
    }
    left -= len;
  }
  return range;
}

// ─── Taps and swipes (rule 20) ───────────────────────────────────────────────
function watchTaps(doc: Document) {
  let sx = 0;
  let sy = 0;
  let st = 0;
  doc.addEventListener(
    'touchstart',
    (e) => {
      const t = e.changedTouches[0];
      if (!t) return;
      sx = t.screenX;
      sy = t.screenY;
      st = e.timeStamp;
    },
    { passive: true },
  );
  doc.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    if (!t || !view) return;
    const dx = t.screenX - sx;
    const dy = t.screenY - sy;
    const sel = doc.getSelection();
    if (sel && !sel.isCollapsed) return;
    // A committed forward swipe at a gate asks native (a half swipe sends nothing, rule 54).
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const committed = view.renderer.scrolled ? dy < -60 : horizontal && dx < -60;
    if (committed && e.timeStamp - st < 800 && atGateNow()) void forward();
  });
  doc.addEventListener('click', (e) => {
    if (!view) return;
    const sel = doc.getSelection();
    if (sel && !sel.isCollapsed) return;
    if ((e.target as Element | null)?.closest?.('a[href]')) return;
    const o = frameOffset(doc);
    const x = e.clientX + o.x;
    const y = e.clientY + o.y;
    // Annotation and marker taps are reported from foliate's hit test (show-annotation).
    if (hitAnything(doc, e.clientX, e.clientY)) return;
    const W = window.innerWidth;
    const zone = view.renderer.scrolled ? 'center' : x < W * 0.3 ? 'left' : x > W * 0.7 ? 'right' : 'center';
    post({ type: 'tap', payload: { zone, x, y } });
  });
}

const hitRects = new WeakMap<Document, { key: string; rects: DOMRect[] }[]>();
function hitAnything(doc: Document, x: number, y: number) {
  return (hitRects.get(doc) ?? []).some(({ rects }) =>
    rects.some((r) => r.top <= y && r.left <= x && r.bottom > y && r.right > x),
  );
}
function remember(doc: Document, key: string, range: Range) {
  const list = (hitRects.get(doc) ?? []).filter((h) => h.key !== key);
  list.push({ key, rects: Array.from(range.getClientRects()) });
  hitRects.set(doc, list);
}

// ─── Highlights and markers (rules 36, 46) ───────────────────────────────────
function drawHighlights() {
  if (!view) return;
  for (const a of annotations.values())
    if (a.kind !== 'bookmark') void view.addAnnotation({ value: a.cfi_range });
}

function onDrawAnnotation(e: Event) {
  const { draw, annotation, doc, range } = (e as CustomEvent).detail as {
    draw: (f: unknown, o: unknown) => void;
    annotation: { value: string };
    doc: Document;
    range: Range;
  };
  const a = annotations.get(annotation.value);
  if (!a) return;
  draw(Overlayer.highlight, { color: HIGHLIGHT_COLORS[a.color] });
  if (a.kind === 'note') draw(Overlayer.underline, { color: '#F5931F', width: 1.5 });
  remember(doc, 'a:' + a.id, range);
}

function onShowAnnotation(e: Event) {
  const { value, range } = (e as CustomEvent).detail as { value: string; range: Range };
  const doc = range.startContainer.ownerDocument!;
  if (value.startsWith('m:')) {
    post({ type: 'marker.tap', payload: { para_id: value.slice(2) } });
    return;
  }
  const a = annotations.get(value);
  if (!a) return;
  const box = range.getBoundingClientRect();
  post({ type: 'annotation.tap', payload: { id: a.id, rect: toViewport(doc, box) } });
}

/** The first sentence of a paragraph: what the dotted underline sits under (prototype .comm). */
function firstSentence(doc: Document, para: Element): Range {
  const r = doc.createRange();
  r.selectNodeContents(para);
  const walker = doc.createTreeWalker(para, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const m = /[.!?…]["'”’)]?(\s|$)/.exec(n.textContent ?? '');
    if (m) {
      r.setEnd(n, m.index + m[0].trimEnd().length);
      break;
    }
  }
  return r;
}

function dotted(rects: DOMRect[], o: { count: number; color: string; ink: string; tint: string }) {
  const NS = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(NS, 'g');
  for (const r of rects) {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(r.left));
    line.setAttribute('x2', String(r.right));
    line.setAttribute('y1', String(r.bottom + 3));
    line.setAttribute('y2', String(r.bottom + 3));
    line.setAttribute('stroke', o.color);
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '2 3');
    g.append(line);
  }
  const last = rects[rects.length - 1];
  if (last) {
    // Count pill after the sentence (prototype .pnum): 11 px bold, 4/8 padding, full radius.
    const label = String(o.count);
    const w = 16 + 6.5 * label.length + 14;
    const h = 19;
    const x = last.right + 4;
    const y = last.top + (last.height - h) / 2;
    const pill = document.createElementNS(NS, 'rect');
    pill.setAttribute('x', String(x));
    pill.setAttribute('y', String(y));
    pill.setAttribute('width', String(w));
    pill.setAttribute('height', String(h));
    pill.setAttribute('rx', String(h / 2));
    pill.setAttribute('fill', o.tint);
    g.append(pill);
    const icon = document.createElementNS(NS, 'path');
    // i-chat, scaled to 11 px.
    icon.setAttribute('d', 'M2 2.5h8.5v5.5H5.2L2.8 10V8H2z');
    icon.setAttribute('transform', `translate(${x + 7} ${y + 4})`);
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', o.ink);
    icon.setAttribute('stroke-width', '1.2');
    icon.setAttribute('stroke-linejoin', 'round');
    g.append(icon);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x + 21));
    t.setAttribute('y', String(y + 13.5));
    t.setAttribute('fill', o.ink);
    t.setAttribute('font-size', '11');
    t.setAttribute('font-weight', '700');
    t.setAttribute('font-family', 'Inter, sans-serif');
    t.textContent = label;
    g.append(t);
  }
  return g;
}

function drawMarkers() {
  if (!view || !settings) return;
  const c = view.renderer.getContents()[0];
  if (!c?.overlayer) return;
  const dark = settings.theme === 'dark';
  for (const m of markers) {
    const para = c.doc.getElementById(m.para_id);
    if (!para) continue;
    const range = firstSentence(c.doc, para);
    c.overlayer.add('m:' + m.para_id, range, (rects: DOMRect[]) =>
      dotted(rects, {
        count: m.count,
        color: '#F5931F',
        ink: dark ? '#F5B36A' : '#9A4F00',
        tint: dark ? 'rgba(245,147,31,.18)' : '#FDEEDB',
      }),
    );
    remember(c.doc, 'm:' + m.para_id, range);
  }
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function applySettings(s: ReaderSettings) {
  settings = s;
  if (!view) return;
  const r = view.renderer;
  const W = window.innerWidth;
  // Prototype .page: 24 px sides, 20 px top. foliate insets text by gap × width in total (outer
  // padding gW/2 plus half its inner column gap, also gW/2), so gap = 24 / W.
  r.setAttribute('gap', `${((24 / W) * 100).toFixed(3)}%`);
  r.setAttribute('margin', '20px');
  r.setAttribute('max-inline-size', `${W}px`);
  r.setAttribute('max-column-count', '1');
  r.setAttribute('flow', s.layout === 'scroll' ? 'scrolled' : 'paginated');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) r.removeAttribute('animated');
  else r.setAttribute('animated', '');
  r.setStyles(bookCss(s));
  const dark = s.theme === 'dark';
  view.style.setProperty('--overlayer-highlight-opacity', dark ? '.32' : '1');
  view.style.setProperty('--overlayer-highlight-blend-mode', dark ? 'normal' : 'multiply');
  document.documentElement.style.background = dark ? '#14110D' : s.theme === 'sepia' ? '#F6EBD9' : '#FFFFFF';
}

// ─── Open / reopen ───────────────────────────────────────────────────────────
let reopened: Promise<void> = Promise.resolve();

function mount(): FoliateView {
  const v = document.createElement('foliate-view') as FoliateView;
  v.addEventListener('relocate', (e) => {
    const d = (e as CustomEvent).detail as { cfi: string; range: Range };
    onRelocate(d);
  });
  v.addEventListener('load', (e) => {
    const { doc, index } = (e as CustomEvent).detail as { doc: Document; index: number };
    currentIndex = index;
    applyGates();
    decorate(doc, index);
  });
  v.addEventListener('create-overlay', () => {
    drawHighlights();
    drawMarkers();
  });
  v.addEventListener('draw-annotation', onDrawAnnotation);
  v.addEventListener('show-annotation', onShowAnnotation);
  // Links inside the book stay inside; anything external is ignored (no network).
  v.addEventListener('external-link', (e) => e.preventDefault());
  document.getElementById('book')!.replaceChildren(v);
  return v;
}

async function startAt(start: { cfi?: string; para_id?: string } | string | null) {
  if (!view) return;
  if (typeof start === 'string') return view.init({ lastLocation: start });
  if (start?.cfi) return view.init({ lastLocation: start.cfi });
  if (start?.para_id) {
    const c = paraIndex.get(start.para_id)?.chapter;
    if (c) {
      await view.goTo(c.ord);
      const doc = view.renderer.getContents()[0]?.doc;
      const el = doc?.getElementById(start.para_id);
      if (el) return void view.goTo(view.getCFI(c.ord, rangeOf(doc!, el)));
      return;
    }
  }
  return view.init({ lastLocation: null });
}
const rangeOf = (doc: Document, el: Element) => {
  const r = doc.createRange();
  r.selectNodeContents(el);
  r.collapse(true);
  return r;
};

async function open(p: Extract<NativeToWeb, { type: 'open' }>['payload']) {
  manifest = p.manifest;
  paraIndex = indexParagraphs(p.manifest);
  access = p.access;
  gateRoom = p.gate_room;
  annotations.clear();
  for (const a of p.annotations) annotations.set(a.cfi_range, a);
  try {
    const epub = new EPUB(loader);
    book = (await epub.init()) as Book;
  } catch (e) {
    post({ type: 'error', payload: { code: 'parse_failed', detail: String(e) } });
    return;
  }
  view = mount();
  try {
    settling = true;
    await view.open(book);
    applySettings(p.settings);
    post({
      type: 'opened',
      payload: {
        toc: (book.toc ?? []).map((t) => ({ label: t.label, href: t.href })),
        sections: book.sections.length,
      },
    });
    await settled(() => startAt(p.start));
  } catch (e) {
    settling = false;
    post({ type: 'error', payload: { code: 'render_failed', detail: String(e) } });
  }
}

/** Hold position reports until the book stands at its target, then report that place once. */
let settling = false;
async function settled(go: () => Promise<unknown>) {
  settling = true;
  try {
    await go();
  } finally {
    settling = false;
  }
  if (view?.lastLocation) onRelocate(view.lastLocation);
}

/** After an unlock or undo: reload the open section with its new file at the same place (rule 8). */
function reopen(): Promise<void> {
  const at = view?.lastLocation?.cfi ?? null;
  reopened = (async () => {
    if (!book || !settings) return;
    settling = true;
    for (const s of book.sections) s.unload?.();
    view?.close();
    view = mount();
    await view.open(book);
    applySettings(settings);
    await settled(() => startAt(at));
  })().catch((e) => {
    settling = false;
    post({ type: 'error', payload: { code: 'render_failed', detail: String(e) } });
  });
  return reopened;
}

// ─── Search (rule 25): only what the reader can open ─────────────────────────
async function search(query: string) {
  if (!view || !book || !manifest) return;
  const items: { cfi: string; excerpt: string; chapter_uid: string | null }[] = [];
  let lockedLeft = false;
  for (const c of manifest.chapters) {
    const a = access[c.chapter_uid];
    if (a === 'locked' || a === 'partial') lockedLeft = true;
    if (a === 'locked') continue;
    for await (const r of view.search({ query, index: c.ord })) {
      const hit = r as { cfi?: string; excerpt?: { pre: string; match: string; post: string } } | 'done';
      if (hit === 'done' || !hit.cfi) continue;
      const ex = hit.excerpt;
      items.push({
        cfi: hit.cfi,
        excerpt: ex ? `${ex.pre}${ex.match}${ex.post}` : '',
        chapter_uid: c.chapter_uid,
      });
      if (items.length >= 200) break;
    }
  }
  view.clearSearch();
  post({ type: 'search.result', payload: { items, locked_left: lockedLeft, done: true } });
}

// ─── Native → web ────────────────────────────────────────────────────────────
async function onMessage(raw: unknown) {
  if (typeof raw !== 'string') return;
  const m = parseFromNative(raw);
  if (!m) return log('dropped message', 'warn');
  switch (m.type) {
    case 'open':
      return open(m.payload);
    case 'resource.response': {
      const p = pendingFiles.get(m.reply_to);
      if (!p) return;
      pendingFiles.delete(m.reply_to);
      if (m.payload.bytes_b64 != null) p.resolve(b64ToBytes(m.payload.bytes_b64));
      else if (m.payload.error === 'missing') p.resolve(null);
      else p.reject(new Error(m.payload.error ?? 'resource_failed'));
      return;
    }
    case 'goTo': {
      if (!view || !manifest) return;
      const t = m.payload;
      if ('cfi' in t) return void view.goTo(t.cfi);
      if ('chapter_uid' in t) {
        const c = manifest.chapters.find((x) => x.chapter_uid === t.chapter_uid);
        if (c) {
          currentIndex = c.ord;
          applyGates();
          await view.goTo(c.ord);
        }
        return;
      }
      if ('para_id' in t) return startAt({ para_id: t.para_id });
      if ('percent' in t) {
        const target = (t.percent / 100) * manifest.total_words;
        let pid: string | null = null;
        for (const c of manifest.chapters)
          for (const p of c.paragraphs) if (p.words_before <= target) pid = p.id;
        if (pid) return startAt({ para_id: pid });
      }
      return;
    }
    case 'next':
      if (!view) return;
      return m.payload.unit === 'chapter' ? view.renderer.nextSection() : forward();
    case 'prev':
      if (!view) return;
      return m.payload.unit === 'chapter' ? view.renderer.prevSection() : view.prev();
    case 'settings.apply': {
      const at = view?.lastLocation?.cfi;
      applySettings(m.payload);
      if (at && view) await view.goTo(at);
      drawMarkers();
      return;
    }
    case 'access.update':
      access = m.payload.access;
      if (m.payload.gate_room) gateRoom = m.payload.gate_room;
      applyGates();
      if (m.payload.reload_section) await reopen();
      else {
        const c = view?.renderer.getContents()[0];
        if (c) decorate(c.doc, c.index);
        if (view?.lastLocation) onRelocate(view.lastLocation);
      }
      return;
    case 'annotations.set': {
      if (!view) return;
      if (m.payload.replace) {
        for (const a of annotations.values()) void view.deleteAnnotation({ value: a.cfi_range });
        annotations.clear();
      }
      for (const id of m.payload.remove ?? []) {
        const a = [...annotations.values()].find((x) => x.id === id);
        if (a) {
          annotations.delete(a.cfi_range);
          void view.deleteAnnotation({ value: a.cfi_range });
        }
      }
      for (const a of m.payload.list) {
        annotations.set(a.cfi_range, a);
        if (a.kind !== 'bookmark') void view.addAnnotation({ value: a.cfi_range });
      }
      return;
    }
    case 'markers.set':
      markers = m.payload.list;
      drawMarkers();
      return;
    case 'selection.clear':
      view?.deselect();
      return;
    case 'advance.decision': {
      const r = pendingAdvance.get(m.reply_to);
      pendingAdvance.delete(m.reply_to);
      r?.(m.payload);
      return;
    }
    case 'search':
      return search(m.payload.query);
  }
}

// Android WebView delivers postMessage on document; iOS on window. Native is the only sender.
document.addEventListener('message', (e) => void onMessage((e as MessageEvent).data));
window.addEventListener('message', (e) => void onMessage(e.data));
window.addEventListener('error', (e) =>
  post({ type: 'error', payload: { code: 'render_failed', detail: String(e.message) } }),
);
// Read-only state for debugging (Chrome smoke, WebView inspector). Nothing secret lives here.
(window as unknown as { __arp?: unknown }).__arp = {
  get last() {
    return lastRelocate;
  },
  get page() {
    const r = view?.renderer;
    return r ? { page: r.page, pages: r.pages, atEnd: r.atEnd, index: currentIndex } : null;
  },
};
post({ type: 'ready', payload: { bundle_version: __BUNDLE_VERSION__ } });
