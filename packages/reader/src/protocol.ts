// Flow 04 rule D: the bridge between the app and the reader WebView. Every message is
// `{v:1, id?, reply_to?, type, payload}`. Both sides drop unknown types and other versions.
import type { ChapterAccess, ReadingManifest } from '@arpedia/core';
import type { Rect } from './placement';

export const BRIDGE_VERSION = 1;

export type ReaderTheme = 'light' | 'sepia' | 'dark';
export type ReaderFont = 'literata' | 'inter' | 'serif' | 'atkinson';
export type ReaderLayout = 'pages' | 'scroll';
export type HighlightColor = 'green' | 'yellow' | 'blue' | 'pink' | 'purple' | 'peach';

export interface ReaderSettings {
  font_size: number;
  font: ReaderFont;
  line_spacing: number;
  layout: ReaderLayout;
  theme: ReaderTheme;
  highlight_color: HighlightColor;
  auto_unlock: boolean;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  font_size: 17,
  font: 'literata',
  line_spacing: 1.6,
  layout: 'pages',
  theme: 'light',
  highlight_color: 'yellow',
  auto_unlock: true,
};

export const FONT_SIZE_MIN = 14;
export const FONT_SIZE_MAX = 28;
export const LINE_SPACINGS = { tight: 1.35, normal: 1.6, loose: 1.85 } as const;

/** Page and text colours per reader background (rule 63). Independent of the app theme (rule 64). */
export const READER_THEMES: Record<ReaderTheme, { page: string; text: string }> = {
  light: { page: '#FFFFFF', text: '#1D1A16' },
  sepia: { page: '#F6EBD9', text: '#3B2F22' },
  dark: { page: '#14110D', text: '#E8E0D4' },
};

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  green: '#BBF7D0',
  yellow: '#FDE68A',
  blue: '#BFDBFE',
  pink: '#FBCFE8',
  purple: '#DDD6FE',
  peach: '#FED7AA',
};

export interface StartPosition {
  cfi?: string;
  para_id?: string;
  /** Words into the paragraph. */
  offset?: number;
  /** The saved chapter: where the book opens when neither the CFI nor the paragraph resolves (rule 11). */
  chapter_uid?: string;
}

export interface DrawAnnotation {
  id: string;
  kind: 'highlight' | 'note' | 'bookmark';
  color: HighlightColor;
  cfi_range: string;
  para_id: string | null;
}

/** Height of the native card the page leaves room for at a gate (0 = no card, Auto-unlock on). */
export interface GateRoom {
  preview: number;
  chapter: number;
}

export interface Gate {
  kind: 'chapter' | 'preview';
  chapter_uid: string;
}

export interface RelocateDetail {
  cfi: string;
  para_id: string | null;
  offset: number;
  chapter_uid: string | null;
  start_para: string | null;
  end_para: string | null;
  percent: number;
  page: number;
  words_left_in_chapter: number;
  at_first_page_of_chapter: boolean;
  at_last_page_of_book: boolean;
  at_gate: Gate | null;
  /** Where the gate room starts on screen (WebView coordinates), when it is visible. */
  gate_top: number | null;
}

export interface SelectionDetail {
  cfi_range: string;
  text: string;
  para_id_start: string | null;
  para_id_end: string | null;
  chapter_uid: string | null;
  rects: Rect[];
  page_rect: Rect;
  /** The selection hit the 1,000-character limit and was cut (rule 29). */
  clipped?: boolean;
}

export type NativeToWeb =
  | {
      type: 'open';
      payload: {
        manifest: ReadingManifest;
        access: Record<string, ChapterAccess>;
        start: StartPosition;
        settings: ReaderSettings;
        annotations: DrawAnnotation[];
        gate_room: GateRoom;
      };
    }
  | { type: 'resource.response'; reply_to: string; payload: { bytes_b64?: string; error?: string } }
  | {
      type: 'goTo';
      payload:
        | { cfi: string }
        | { para_id: string; offset?: number }
        | { percent: number }
        | { chapter_uid: string };
    }
  | { type: 'next' | 'prev'; payload: { unit: 'page' | 'chapter' } }
  | { type: 'settings.apply'; payload: ReaderSettings }
  | {
      type: 'access.update';
      payload: { access: Record<string, ChapterAccess>; reload_section: boolean; gate_room?: GateRoom };
    }
  | { type: 'annotations.set'; payload: { list: DrawAnnotation[]; replace: boolean; remove?: string[] } }
  | { type: 'markers.set'; payload: { list: { para_id: string; count: number }[] } }
  | { type: 'selection.clear'; payload?: undefined }
  | { type: 'advance.decision'; reply_to: string; payload: { allow: boolean; reason?: string } }
  | { type: 'search'; payload: { query: string } };

export type WebToNative =
  | { type: 'ready'; payload: { bundle_version: string } }
  | { type: 'opened'; payload: { toc: { label: string; href: string }[]; sections: number } }
  | { type: 'resource.request'; id: string; payload: { path: string } }
  | { type: 'relocate'; payload: RelocateDetail }
  | { type: 'advance.request'; id: string; payload: { from_chapter_uid: string; gate_kind: Gate['kind'] } }
  | { type: 'tap'; payload: { zone: 'left' | 'center' | 'right'; x: number; y: number } }
  | { type: 'selection'; payload: SelectionDetail }
  | { type: 'selection.cleared'; payload?: undefined }
  | { type: 'annotation.tap'; payload: { id: string; rect: Rect } }
  | { type: 'marker.tap'; payload: { para_id: string } }
  | {
      type: 'search.result';
      payload: {
        items: { cfi: string; excerpt: string; chapter_uid: string | null }[];
        locked_left: boolean;
        done: boolean;
      };
    }
  | { type: 'log'; payload: { level: 'info' | 'warn'; message: string } }
  /** The saved place no longer exists (an update moved it); the book opened nearby (rule 11). */
  | { type: 'start.moved'; payload?: undefined }
  | {
      type: 'error';
      payload: {
        code: 'parse_failed' | 'resource_missing' | 'decrypt_failed' | 'render_failed';
        detail: string;
        chapter_uid?: string;
      };
    };

export type Envelope<T> = T & { v: number; id?: string; reply_to?: string };

const NATIVE_TYPES = new Set<string>([
  'open',
  'resource.response',
  'goTo',
  'next',
  'prev',
  'settings.apply',
  'access.update',
  'annotations.set',
  'markers.set',
  'selection.clear',
  'advance.decision',
  'search',
]);
const WEB_TYPES = new Set<string>([
  'ready',
  'opened',
  'resource.request',
  'relocate',
  'advance.request',
  'tap',
  'selection',
  'selection.cleared',
  'annotation.tap',
  'marker.tap',
  'search.result',
  'log',
  'start.moved',
  'error',
]);

function parse(raw: string, allowed: Set<string>): Envelope<{ type: string; payload?: unknown }> | null {
  try {
    const m = JSON.parse(raw) as Envelope<{ type: string; payload?: unknown }>;
    if (!m || m.v !== BRIDGE_VERSION || typeof m.type !== 'string' || !allowed.has(m.type)) return null;
    return m;
  } catch {
    return null;
  }
}

/** Native side: parse a message from the WebView (null = drop it). */
export const parseFromWeb = (raw: string) => parse(raw, WEB_TYPES) as Envelope<WebToNative> | null;
/** WebView side: parse a message from native (null = drop it). */
export const parseFromNative = (raw: string) => parse(raw, NATIVE_TYPES) as Envelope<NativeToWeb> | null;
