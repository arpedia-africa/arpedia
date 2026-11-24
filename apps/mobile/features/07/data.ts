import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CoverTone } from '@arpedia/ui';
import {
  ROOM_PROGRESS_SYNC_MS,
  type ChatMessage,
  type Database,
  type JoinStatus,
  type PostBlock,
  type RoomJoinPolicy,
  type RoomPace,
  type RoomState,
} from '@arpedia/core';
import { supabase } from '@/lib/supabase';
import { historyKey } from '../06/chat';
import { useAskPush } from '../15/push';

// Flow 07 server data: rooms list, one room, members, annotations, chat history with spoiler stamps,
// the library for "Choose the book", and the create / join / leave / host actions
// (RPCs in 20261119400000_07_rooms).

const CHAT_URL = process.env.EXPO_PUBLIC_CHAT_URL ?? '';
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

export interface BookCard {
  id: string;
  title: string;
  cover_key: string | null;
  author_name: string | null;
  chapter_count: number;
  status?: string;
}

export type RoomRow = Omit<
  Database['public']['Functions']['get_my_rooms']['Returns'][number],
  'book' | 'state'
> & { book: BookCard; state: RoomState };

export interface HeaderMember {
  user_id: string;
  name: string;
  avatar_url: string | null;
  percent: number;
  finished: boolean;
}

/** `get_room`: the header and composer state of one room. */
export interface Room {
  id: string;
  name: string;
  code: string;
  book: BookCard;
  pace: RoomPace;
  join_policy: RoomJoinPolicy;
  state: RoomState;
  starts_at: string;
  ended_at: string | null;
  host_id: string | null;
  is_host: boolean;
  member_count: number;
  finished_count: number;
  large: boolean;
  my_percent: number;
  my_chapter: number;
  my_finished: boolean;
  progress_updated_at: string | null;
  behind: number;
  locked: boolean;
  locked_by_staff: boolean;
  post_block: PostBlock | 'new_account' | null;
  post_block_until: string | null;
  new_account: boolean;
  header: HeaderMember[];
}

export type RoomMember = Database['public']['Functions']['get_room_members']['Returns'][number];

export interface RoomAnnotations {
  locked: boolean;
  percent: number;
  items: {
    id: string;
    user_id: string;
    name: string;
    kind: 'highlight' | 'note';
    quote: { text?: string; chapter?: number } | string | null;
    note: string | null;
    created_at: string;
  }[];
}

export type RoomMessage = ChatMessage & { spoiler_chapter?: number | null };

export const roomsKey = ['rooms', 'mine'] as const;
export const roomKey = (id: string) => ['rooms', 'room', id] as const;
export const membersKey = (id: string) => ['rooms', 'members', id] as const;
export const annotationsKey = (id: string) => ['rooms', 'annotations', id] as const;

/** No Realtime: the list refreshes on focus and every 20 s; the header every 15 s (rule 24). */
export function useMyRooms() {
  return useQuery({
    queryKey: roomsKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_rooms');
      if (error) throw error;
      return data as unknown as RoomRow[];
    },
    refetchInterval: 20_000,
  });
}

export function useRoom(id: string) {
  return useQuery({
    queryKey: roomKey(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_room', { p_room: id });
      if (error) throw error;
      return data as unknown as Room;
    },
    // Progress frames arrive on the chat socket in the long run; until the shared chat hook passes
    // them on, the header re-reads every sync interval.
    refetchInterval: ROOM_PROGRESS_SYNC_MS,
  });
}

/** The Members tab, 50 at a time (spec: Large rooms). */
export function useRoomMembers(id: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: membersKey(id),
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('get_room_members', { p_room: id, p_offset: pageParam });
      if (error) throw error;
      return data;
    },
    getNextPageParam: (last, all) => (last.length >= 50 ? all.length * 50 : undefined),
  });
}

export function useRoomAnnotations(id: string, enabled: boolean) {
  return useQuery({
    queryKey: annotationsKey(id),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_room_annotations', { p_room: id });
      if (error) throw error;
      return data as unknown as RoomAnnotations;
    },
  });
}

async function fetchRoomHistory(id: string) {
  const { data, error } = await supabase.rpc('get_room_messages', { p_room: id, p_limit: 50 });
  if (error) throw error;
  return (data as unknown as RoomMessage[]).slice().reverse();
}

/**
 * The last 50 room messages with their spoiler stamps. It shares flow 06's history cache key, so
 * the live frames the chat socket merges land in the same list.
 */
export function useRoomHistory(id: string) {
  return useQuery({ queryKey: historyKey(id), queryFn: () => fetchRoomHistory(id) });
}

/**
 * Live messages arrive without a spoiler stamp. After one lands, read the stamps from Postgres once
 * and merge them in (never replacing messages that aren't saved yet).
 */
export function useStampRefresh(id: string) {
  const qc = useQueryClient();
  return useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void fetchRoomHistory(id)
          .then((fresh) => {
            const stamp = new Map(fresh.map((m) => [m.id, m.spoiler_chapter]));
            qc.setQueryData<RoomMessage[]>(historyKey(id), (old) =>
              (old ?? []).map((m) =>
                m.spoiler_chapter == null && stamp.has(m.id) ? { ...m, spoiler_chapter: stamp.get(m.id) } : m,
              ),
            );
          })
          .catch(() => {});
      }, 2500);
    };
  }, [id, qc]);
}

/**
 * Rule 6: books in the library, each once, newest first: unlocked books and books opened on the free
 * preview only (the server accepts both; members unlock for themselves).
 */
export function useLibraryBooks() {
  return useQuery({
    queryKey: ['rooms', 'library'],
    queryFn: async () => {
      const [ent, prog] = await Promise.all([
        supabase.from('entitlements').select('book_id, created_at').is('revoked_at', null),
        supabase.from('reading_progress').select('book_id, chapter_ord, finished_at, last_opened_at'),
      ]);
      if (ent.error) throw ent.error;
      if (prog.error) throw prog.error;
      const progress = new Map((prog.data ?? []).map((p) => [p.book_id, p]));
      const latest = new Map<string, string>();
      for (const e of ent.data ?? []) latest.set(e.book_id, e.created_at);
      for (const p of prog.data ?? [])
        if (p.last_opened_at > (latest.get(p.book_id) ?? '')) latest.set(p.book_id, p.last_opened_at);
      const ids = [...latest.keys()].sort((a, b) => latest.get(b)!.localeCompare(latest.get(a)!));
      if (!ids.length) return [] as LibraryBook[];
      const { data: books, error: e2 } = await supabase
        .from('books')
        .select('id, title, current_revision_id')
        .in('id', ids)
        .eq('status', 'live');
      if (e2) throw e2;
      const byId = new Map((books ?? []).map((b) => [b.id, b]));
      return ids.flatMap((id): LibraryBook[] => {
        const b = byId.get(id);
        const p = progress.get(id);
        return b
          ? [
              {
                id: b.id,
                title: b.title,
                revisionId: b.current_revision_id,
                chapterOrd: p?.chapter_ord ?? 0,
                finished: !!p?.finished_at,
              },
            ]
          : [];
      });
    },
  });
}

export interface LibraryBook {
  id: string;
  title: string;
  revisionId: string | null;
  /** The chapter the reader is on (1-based; 0 before opening it). */
  chapterOrd: number;
  finished: boolean;
}

/** Rule 7: chapters the creator has not finished yet (the one they are on counts as unfinished). */
export function chaptersLeft(book: Pick<LibraryBook, 'chapterOrd' | 'finished'>, chapters: number): number {
  if (book.finished) return 0;
  return Math.max(0, chapters - Math.max(0, book.chapterOrd - 1));
}

/** Chapter count of the picked book, for the pace hint ("Finishes around 28 December"). */
export function useChapterCount(book: LibraryBook | undefined) {
  return useQuery({
    queryKey: ['rooms', 'chapter-count', book?.revisionId],
    enabled: !!book?.revisionId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('chapters')
        .select('id', { count: 'exact', head: true })
        .eq('revision_id', book!.revisionId!)
        .eq('kind', 'chapter');
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Does the account count as a minor? Anyone rooms are hidden from them (rule: minors). */
export function useIsMinor(userId: string | undefined) {
  return useQuery({
    queryKey: ['rooms', 'is-minor', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_minor', { p_user: userId! });
      if (error) throw error;
      return !!data;
    },
  });
}

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Ask the room's Durable Object to re-read access (after lock, mute, end, join or leave). */
export async function refreshRoom(id: string, self = false) {
  await fetch(`${CHAT_URL}/c/${id}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify(self ? { self: true } : {}),
  }).catch(() => {});
}

/** Per book: when it last sent, and the newest position waiting for the window to pass. */
const syncs = new Map<
  string,
  { last: number; pending?: { percent: number; chapter: number }; timer?: ReturnType<typeof setTimeout> }
>();

async function sendProgress(bookId: string, percent: number, chapter: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/v1/rooms/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ book_id: bookId, percent, chapter }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Progress-sync for the reader (flow 04): call after every page turn while a book is open. Sends
 * at most once per ROOM_PROGRESS_SYNC_MS per book; a turn inside the window is sent when it ends
 * (newest position only), so the last page turn is never lost. Rooms with this book get the new
 * percent within 15 seconds (rule 24).
 */
export function syncRoomProgress(bookId: string, percent: number, chapter: number): void {
  const s = syncs.get(bookId) ?? { last: 0 };
  syncs.set(bookId, s);
  const wait = s.last + ROOM_PROGRESS_SYNC_MS - Date.now();
  if (wait > 0) {
    s.pending = { percent, chapter };
    s.timer ??= setTimeout(() => {
      s.timer = undefined;
      const p = s.pending;
      s.pending = undefined;
      if (p) syncRoomProgress(bookId, p.percent, p.chapter);
    }, wait);
    return;
  }
  s.last = Date.now();
  void sendProgress(bookId, percent, chapter).then((ok) => {
    // A failed send doesn't hold back the next page turn.
    if (!ok) s.last = 0;
  });
}

// ─── Create, join, leave, host actions ──────────────────────────────────────
export type CreateError =
  'host_limit' | 'room_limit' | 'room_name' | 'name_blocked' | 'minor_anyone' | 'other';

export function createErrorOf(e: unknown): CreateError {
  const m = String((e as { message?: string })?.message ?? '');
  for (const k of ['host_limit', 'room_limit', 'room_name', 'minor_anyone'] as const)
    if (m.includes(k)) return k;
  if (/muted|name_blocked|different name/i.test(m)) return 'name_blocked';
  return 'other';
}

export function useCreateRoom() {
  const qc = useQueryClient();
  const askPush = useAskPush();
  return useMutation({
    mutationFn: async (v: { name: string; book: string; pace: RoomPace; join_policy: RoomJoinPolicy }) => {
      const { data, error } = await supabase.rpc('create_reading_room', {
        p_name: v.name.trim(),
        p_book: v.book,
        p_pace: v.pace,
        p_join_policy: v.join_policy,
      });
      if (error) throw error;
      return data as unknown as { room_id: string; code: string };
    },
    onSuccess: () => {
      askPush('join');
      return qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export interface JoinResult {
  status: JoinStatus;
  room_id?: string;
  retry_at?: string;
  name?: string;
  book_title?: string;
  member_count?: number;
  blocked_member?: boolean;
}

/** Without `confirm` the server answers `confirm` (the consent line) instead of joining. */
export function useJoinRoom() {
  const qc = useQueryClient();
  const askPush = useAskPush();
  return useMutation({
    mutationFn: async (v: { code: string; confirm: boolean }) => {
      const { data, error } = await supabase.rpc('join_reading_room', {
        p_code: v.code,
        p_confirm: v.confirm,
      });
      if (error) throw error;
      const r = data as unknown as JoinResult;
      if (r.room_id && (r.status === 'joined' || r.status === 'member')) await refreshRoom(r.room_id, true);
      return r;
    },
    onSuccess: (r) => {
      if (r.status === 'joined') askPush('join');
      return qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

// ─── Read-alongs in Discover (rule 8) ───────────────────────────────────────
export interface OpenRoom {
  room_id: string;
  name: string;
  book: BookCard;
  member_count: number;
  finished_count: number;
  state: RoomState;
  starts_at: string;
  joined: boolean;
}

/** Live and scheduled "Anyone" rooms (never the code). Empty for minors (server side). */
export function useOpenRooms(enabled: boolean) {
  return useQuery({
    queryKey: ['rooms', 'open'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_open_rooms', { p_limit: 50 });
      if (error) throw error;
      return data as unknown as OpenRoom[];
    },
  });
}

/** Join an "Anyone" room without the code; like `useJoinRoom`, the first call asks for consent. */
export function useJoinOpenRoom() {
  const qc = useQueryClient();
  const askPush = useAskPush();
  return useMutation({
    mutationFn: async (v: { room: string; confirm: boolean }) => {
      const { data, error } = await supabase.rpc('join_open_room', { p_room: v.room, p_confirm: v.confirm });
      if (error) throw error;
      const r = data as unknown as JoinResult;
      if (r.room_id && (r.status === 'joined' || r.status === 'member')) await refreshRoom(r.room_id, true);
      return r;
    },
    onSuccess: (r) => {
      if (r.status === 'joined') askPush('join');
      return qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export function useRoomActions(id: string) {
  const qc = useQueryClient();
  const done = (all = false) => {
    void qc.invalidateQueries({ queryKey: all ? ['rooms'] : roomKey(id) });
    void qc.invalidateQueries({ queryKey: membersKey(id) });
    void qc.invalidateQueries({ queryKey: roomsKey });
  };
  const rpc = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    if (error) throw new Error(error.message);
  };
  const leave = useMutation({
    mutationFn: async () => {
      await rpc(supabase.rpc('leave_reading_room', { p_room: id }));
      await refreshRoom(id, true);
    },
    onSuccess: () => done(true),
  });
  const mute = useMutation({
    mutationFn: async (v: { user: string; until: string | null }) => {
      await rpc(supabase.rpc('mute_room_member', { p_room: id, p_user: v.user, p_until: v.until as string }));
      await refreshRoom(id);
    },
    onSuccess: () => done(),
  });
  const lock = useMutation({
    mutationFn: async (locked: boolean) => {
      await rpc(supabase.rpc('set_room_lock', { p_room: id, p_locked: locked }));
      await refreshRoom(id);
    },
    onSuccess: () => done(),
  });
  const end = useMutation({
    mutationFn: async () => {
      await rpc(supabase.rpc('end_reading_room', { p_room: id }));
      await refreshRoom(id);
    },
    onSuccess: () => done(),
  });
  return { leave, mute, lock, end };
}

// ─── Small helpers ──────────────────────────────────────────────────────────
const TONES: CoverTone[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];

/** A stable sample-cover tone per book (real covers arrive with the library flow). */
export function coverToneFor(id: string): CoverTone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length]!;
}

/** "Sunday" for the last week, "Today" and "Yesterday", else "Mon 9 Nov" (rule 18). */
export function roomDayLabel(at: string, now: Date = new Date()): string {
  const d = new Date(at);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Starts Monday" for a room that hasn't started; weekday within a week, else the date. */
export function startsLabel(at: string, now: Date = new Date()): string {
  const d = new Date(at);
  const days = Math.round((d.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return 'Starts today';
  if (days === 1) return 'Starts tomorrow';
  if (days < 7) return `Starts ${d.toLocaleDateString('en-GB', { weekday: 'long' })}`;
  return `Starts ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`;
}

/** "Finished 3 Nov". */
export function finishedLabel(at: string): string {
  return `Finished ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

/** Share text for a room (rule 9). */
export function roomShareMessage(code: string): string {
  return `Join my reading room on Arpedia. Code ${code}\narpedia.africa/r/${code}`;
}
