// Rule 19 / 35: Quick review's phones run the app's reader bundle (`@arpedia/reader/html`) on the
// plain working copy, in preview mode. This is the "native" side of the reader bridge for a
// browser: it answers the bundle's file requests from the preview package the page built
// (`previewBook` in @arpedia/convert) and opens it at one place.
//
// The bundle renders author text, so it never runs on the console's origin: the frame is a
// `data:` page (an opaque origin, cut off from the staff session and cookies) that receives the
// bundle by postMessage and writes it into itself. foliate's own section frames are blob: URLs
// made inside it, so they share its origin and render as on a phone.
import type { ChapterAccess, ReadingManifest } from '@arpedia/core';

export interface SpotBook {
  manifest: ReadingManifest;
  /** Package and chapter files by path, as text. */
  files: Record<string, string>;
  /** Free file by full file path, for a chapter that opens `partial`. */
  freeFiles: Record<string, string>;
  /** Image bytes (base64) by path in the book; a missing one shows as blank. */
  images: Record<string, string>;
}

export interface SpotOpen {
  book: SpotBook;
  access: Record<string, ChapterAccess>;
  para_id: string;
  /** Height the page leaves free at the preview cut, in reader pixels. */
  gateRoom: number;
}

/** The frame's page: waits for the bundle, then becomes it. Same opaque origin throughout. */
export const FRAME_SRC =
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><script>' +
      'addEventListener("message",function m(e){if(e.source!==parent||!e.data||typeof e.data.html!=="string")return;' +
      'removeEventListener("message",m);document.open();document.write(e.data.html);document.close()})' +
      '</script>',
  );

/** The bundle with a bridge in place of React Native's: its posts go to the console page. */
export function frameHtml(readerHtml: string): string {
  const shim =
    '<script>window.ReactNativeWebView={postMessage:function(s){parent.postMessage(s,"*")}}</script>';
  return readerHtml.replace('<head>', `<head>${shim}`);
}

/** Reader defaults (flow 04): what a new reader sees. */
const SETTINGS = {
  font_size: 17,
  font: 'literata',
  line_spacing: 1.6,
  layout: 'pages',
  theme: 'light',
  highlight_color: 'yellow',
  auto_unlock: true,
} as const;

/** 1×1 transparent GIF for an image that could not be loaded. */
const BLANK = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const utf8b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** The bytes the bundle asked for, by the access its chapter opens with (as the app's file store does). */
export function answer(o: SpotOpen, path: string): { bytes_b64?: string; error?: string } {
  const chapter = o.book.manifest.chapters.find(c => path === `c${c.ord}.full.xhtml`);
  const file = chapter && o.access[chapter.chapter_uid] === 'partial' ? (o.book.freeFiles[path] ?? path) : path;
  // A chapter past the cut stays shut, as for a reader with no plan (the app answers it the same way).
  if (chapter && o.access[chapter.chapter_uid] === 'locked') return { error: 'missing' };
  const text = o.book.files[file];
  if (text != null) return { bytes_b64: utf8b64(text) };
  if (path.startsWith('img/')) return { bytes_b64: o.book.images[path] ?? BLANK };
  return { error: 'missing' };
}

/**
 * Run the bundle in `frame` and open the book at `o.para_id`. `onShown` fires once the page stands
 * at its place; `onFailed` when the bundle reports an error or never opens. Returns a stop function.
 */
export function hostReader(
  frame: HTMLIFrameElement,
  readerHtml: string,
  o: SpotOpen,
  on: { onShown: () => void; onFailed: () => void },
): () => void {
  let done = false;
  const send = (m: object) => frame.contentWindow?.postMessage(JSON.stringify({ v: 1, ...m }), '*');
  const finish = (ok: boolean) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (ok) on.onShown();
    else on.onFailed();
  };
  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow || typeof e.data !== 'string') return;
    let m: { v?: number; id?: string; type?: string; payload?: { path?: string } };
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m.v !== 1) return;
    if (m.type === 'ready')
      send({
        type: 'open',
        payload: {
          manifest: o.book.manifest,
          access: o.access,
          start: { para_id: o.para_id },
          settings: SETTINGS,
          annotations: [],
          gate_room: { preview: o.gateRoom, chapter: o.gateRoom },
        },
      });
    else if (m.type === 'resource.request' && m.id && m.payload?.path)
      send({ type: 'resource.response', reply_to: m.id, payload: answer(o, m.payload.path) });
    else if (m.type === 'relocate') finish(true);
    else if (m.type === 'error') finish(false);
  };
  const onLoad = () => frame.contentWindow?.postMessage({ html: frameHtml(readerHtml) }, '*');
  window.addEventListener('message', onMessage);
  frame.addEventListener('load', onLoad);
  // A page that has not opened in 20 seconds keeps the plain text instead.
  const timer = setTimeout(() => finish(false), 20_000);
  return () => {
    done = true;
    clearTimeout(timer);
    window.removeEventListener('message', onMessage);
    frame.removeEventListener('load', onLoad);
  };
}
