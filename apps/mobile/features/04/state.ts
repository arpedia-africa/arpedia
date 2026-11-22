// Reader state from the server (get_reader_state, flow 04 rule 10) and the reader settings mapping
// between profiles.reader_settings (names) and the bundle (numbers).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import type { ChapterAccess, PendingCharge, PendingStore } from '@arpedia/core';
import {
  DEFAULT_READER_SETTINGS,
  LINE_SPACINGS,
  type HighlightColor,
  type ReaderFont,
  type ReaderLayout,
  type ReaderSettings,
  type ReaderTheme,
} from '@arpedia/reader';
import { supabase } from '@/lib/supabase';

export interface ReaderChapterState {
  chapter_uid: string;
  ord: number;
  kind: 'chapter' | 'part';
  title: string;
  words: number;
  words_before: number;
  pages: number;
  price_credits: number;
  access: ChapterAccess;
}

export interface ReaderState {
  book: {
    id: string;
    title: string;
    status: string;
    cover_key: string | null;
    author: { id: string; name: string | null };
  };
  revision: {
    id: string;
    revision_no: number;
    manifest_key: string | null;
    artifact_prefix: string | null;
    words: number;
    pages: number;
    preview_cut: { chapter_uid: string | null; para_id: string | null };
  };
  chapters: ReaderChapterState[];
  owns_book: boolean;
  is_author: boolean;
  price: number;
  paid_credits: number;
  remaining: number;
  balance: number;
  plan: { state: string; plan_code?: string | null; period_end?: string | null };
  position: {
    revision_id: string;
    cfi: string | null;
    chapter_uid: string | null;
    para_id: string | null;
    char_offset: number | null;
    percent: number;
    max_percent: number;
    device_id: string | null;
    device_name: string | null;
    updated_at: string;
    finished_at: string | null;
  } | null;
  annotations_cursor: string | null;
  reader_settings: Record<string, unknown> | null;
  server_time: string;
}

export const readerKey = (id: string) => ['reader-state', id] as const;

export function useReaderState(id: string) {
  return useQuery({
    queryKey: readerKey(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_reader_state', { p_book: id });
      if (error) throw error;
      return data as unknown as ReaderState;
    },
    // Money on cards is read from the server after every spend (rule 62), so never serve it stale.
    staleTime: 0,
  });
}

type SpacingName = keyof typeof LINE_SPACINGS;
const spacingName = (n: number): SpacingName =>
  (Object.entries(LINE_SPACINGS).find(([, v]) => v === n)?.[0] as SpacingName | undefined) ?? 'normal';

export function toSettings(raw: Record<string, unknown> | null | undefined): ReaderSettings {
  const r = raw ?? {};
  const d = DEFAULT_READER_SETTINGS;
  const ls = r.line_spacing as SpacingName | undefined;
  return {
    font_size: typeof r.font_size === 'number' ? r.font_size : d.font_size,
    font: (r.font as ReaderFont | undefined) ?? d.font,
    line_spacing: ls && ls in LINE_SPACINGS ? LINE_SPACINGS[ls] : d.line_spacing,
    layout: (r.layout as ReaderLayout | undefined) ?? d.layout,
    theme: (r.theme as ReaderTheme | undefined) ?? d.theme,
    highlight_color: (r.highlight_color as HighlightColor | undefined) ?? d.highlight_color,
    auto_unlock: r.auto_unlock !== false,
  };
}

/** One setting as profiles.reader_settings stores it. */
export function settingValue<K extends keyof ReaderSettings>(key: K, v: ReaderSettings[K]): unknown {
  return key === 'line_spacing' ? spacingName(v as number) : v;
}

// ─── Pending chapter charges, kept across app restarts (rule 56) ─────────────
const PENDING = 'reader.pending-charges';

export async function loadPendingStore(): Promise<PendingStore> {
  const raw = await AsyncStorage.getItem(PENDING).catch(() => null);
  const m = new Map<string, PendingCharge>(raw ? (JSON.parse(raw) as [string, PendingCharge][]) : []);
  const save = () => void AsyncStorage.setItem(PENDING, JSON.stringify([...m])).catch(() => undefined);
  return {
    get: (k) => m.get(k),
    set: (k, v) => {
      m.set(k, v);
      save();
    },
    delete: (k) => {
      m.delete(k);
      save();
    },
    values: () => m.values(),
  };
}
