// The native half of the reader (flow 04 A, B, I, K): opens the book in the bundle, answers its
// file requests with decrypted bytes, holds and charges forward moves at gates, keeps the place.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { useQueryClient } from '@tanstack/react-query';
import { chargeKey, confirmCharge, type ChapterAccess, type PendingStore } from '@arpedia/core';
import {
  BRIDGE_VERSION,
  parseFromWeb,
  type DrawAnnotation,
  type GateRoom,
  type HighlightColor,
  type NativeToWeb,
  type ReaderSettings,
  type RelocateDetail,
  type SelectionDetail,
  type Rect,
  type StartPosition,
} from '@arpedia/reader';
import { supabase } from '@/lib/supabase';
import { captureError } from '@/lib/telemetry';
import { useOnline } from '../03/book';
import { rpcError } from '../03/UnlockSheet';
import { applyProgress } from '../05/library';
import { syncRoomProgress } from '../07/data';
import { b64 } from './crypto';
import { BookFiles, type BookManifest } from './bookfiles';
import {
  loadPendingStore,
  readerKey,
  settingValue,
  toSettings,
  useReaderState,
  type ReaderState,
} from './state';
import { useTrack } from './analytics';
import { deviceId, WorkerError } from './worker';
import { flushAnnotations, queuedAnnotations, saveAnnotations, type AnnotationRow } from './annotationQueue';
import { useAskPush } from '../15/push';

export type ReaderPhase = 'loading' | 'ready' | 'error' | 'offline' | 'expired';

export interface UnlockedToast {
  chapter_uid: string;
  ord: number;
  spent: number;
  ledger_id: number | null;
  undo_until: number;
}

export interface Annotation {
  id: string;
  client_id: string;
  kind: 'highlight' | 'note' | 'bookmark';
  color: HighlightColor;
  cfi_range: string;
  chapter_uid: string | null;
  start_para_id: string | null;
  quote: string | null;
  note_text: string | null;
  visibility: 'private' | 'club';
  deleted?: boolean;
  updated_at?: string;
}

const PROGRESS_EVERY = 10_000;
const IDLE_MS = 60_000;
const SESSION_EVERY = 60_000;

/** The newest position on this phone (rule 66), kept per book. */
interface LocalPosition {
  revision_id: string;
  cfi: string;
  para_id: string | null;
  offset: number;
  /** Missing on places saved before rule 11's chapter fallback. */
  chapter_uid?: string | null;
  percent: number;
  at: number;
}
const posKey = (bookId: string) => `reader.pos.${bookId}`;

/** Another device is more than 5% ahead (rule 67): offered as "Continue from n%?". */
export interface ElsewhereOffer {
  percent: number;
  device: string | null;
  start: { cfi: string } | { para_id: string; offset: number };
}

export interface SearchHit {
  cfi: string;
  excerpt: string;
  chapter_uid: string | null;
}

/** Access as the bundle should see it: `unlocked` only with the key here and a valid licence (rule 7). */
function accessMap(
  state: ReaderState,
  files: BookFiles | null,
  licenceOk: boolean,
): Record<string, ChapterAccess> {
  const out: Record<string, ChapterAccess> = {};
  for (const c of state.chapters) {
    let a = c.access;
    if (a === 'unlocked' && (!files?.hasKey(c.chapter_uid) || !licenceOk)) a = 'locked';
    out[c.chapter_uid] = a;
  }
  return out;
}

export function useReader(
  bookId: string,
  opts: { gateRoom: GateRoom; startCfi?: string; payGo?: boolean; source?: string },
) {
  const qc = useQueryClient();
  const track = useTrack();
  const askPush = useAskPush();
  const openedAt = useRef(Date.now());
  const readyTracked = useRef(false);
  const q = useReaderState(bookId);
  const state = q.data;
  const [phase, setPhase] = useState<ReaderPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<BookManifest | null>(null);
  const [loc, setLoc] = useState<RelocateDetail | null>(null);
  const [selection, setSelection] = useState<SelectionDetail | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>(() => toSettings(null));
  const [access, setAccess] = useState<Record<string, ChapterAccess>>({});
  const [toast, setToast] = useState<UnlockedToast | null>(null);
  const [charging, setCharging] = useState<string | null>(null);
  const [lowFor, setLowFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [attempt, setAttempt] = useState(0);
  const previewOnly = useRef(false);
  const [elsewhere, setElsewhere] = useState<ElsewhereOffer | null>(null);
  const [search, setSearch] = useState<{
    query: string;
    items: SearchHit[];
    locked_left: boolean;
    done: boolean;
  } | null>(null);
  const localPos = useRef<LocalPosition | null>(null);
  const myDevice = useRef<string | null>(null);
  const lastActive = useRef(Date.now());

  const web = useRef<{ postMessage(s: string): void } | null>(null);
  const files = useRef<BookFiles | null>(null);
  const accessRef = useRef(access);
  accessRef.current = access;
  const pending = useRef<PendingStore | null>(null);
  const userId = useRef<string | null>(null);
  const opened = useRef(false);
  const ready = useRef(false);
  const lastSync = useRef(0);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastChapter = useRef<string | null>(null);
  const gateRoom = useRef(opts.gateRoom);
  gateRoom.current = opts.gateRoom;
  const payGo = useRef(!!opts.payGo);
  payGo.current = !!opts.payGo;

  const send = useCallback((m: NativeToWeb & { reply_to?: string }) => {
    web.current?.postMessage(JSON.stringify({ v: BRIDGE_VERSION, ...m }));
  }, []);

  // ─── Prepare: device, files, keys, manifest ────────────────────────────────
  const revisionId = state?.revision.id;
  useEffect(() => {
    if (!state || !revisionId) return;
    if (files.current?.revisionId === revisionId) return;
    let live = true;
    const f = new BookFiles(bookId, revisionId, state.owns_book || state.is_author);
    files.current = f;
    (async () => {
      setPhase('loading');
      setSettings(toSettings(state.reader_settings));
      pending.current ??= await loadPendingStore();
      const raw = await AsyncStorage.getItem(posKey(bookId)).catch(() => null);
      localPos.current = raw ? (JSON.parse(raw) as LocalPosition) : null;
      myDevice.current = await deviceId().catch(() => null);
      userId.current = (await supabase.auth.getSession()).data.session?.user.id ?? null;
      let fromStore = false;
      try {
        await f.refreshLinks();
      } catch (e) {
        if (!(e instanceof WorkerError) || e.code !== 'offline') throw e;
        if (!(await f.loadStoredKeys())) {
          if (live) setPhase('offline');
          return;
        }
        fromStore = true;
      }
      const m = await f.loadManifest();
      const ok = await f.licenceValid();
      if (!live) return;
      if (!ok && f.licenceUntil() != null) track('license_expired_open_attempt');
      // Rule 71: an expired download asks for a connection; only the preview opens without one.
      if (!ok && fromStore && f.licenceUntil() != null && !previewOnly.current) {
        setPhase('expired');
        return;
      }
      setManifest(m);
      setAccess(accessMap(state, f, ok));
      // Offline writes go up first, so the pull already has them; any still waiting are drawn on top.
      const uid = userId.current;
      if (uid) await flushAnnotations(uid).catch(() => 0);
      const { data } = await supabase.rpc('pull_annotations', { p_book: bookId });
      const pulled = ((data as { items?: Annotation[] } | null)?.items ?? []).filter((a) => !a.deleted);
      const waiting = uid ? (await queuedAnnotations(uid)).filter((r) => r.book_id === bookId) : [];
      if (live) setAnnotations(withQueued(pulled, waiting));
      setPhase('ready');
    })().catch((e) => {
      if (!live) return;
      setError(String((e as Error)?.message ?? e));
      const offline = e instanceof WorkerError && e.code === 'offline';
      setPhase(offline ? 'offline' : 'error');
      if (!offline) track('reader_error', { code: e instanceof WorkerError ? e.code : 'prepare_failed' });
      if (!offline)
        captureError(e, { book_id: bookId, revision_id: revisionId, bundle_version: BRIDGE_VERSION });
    });
    return () => {
      live = false;
    };
    // The revision decides the files; later state refreshes only update access (below).
  }, [bookId, revisionId, attempt]);

  // Access follows every state refresh (unlock elsewhere, refetch on focus: edge case "device A/B").
  useEffect(() => {
    if (!state || !files.current || phase !== 'ready') return;
    void files.current.licenceValid().then((ok) => {
      const next = accessMap(state, files.current, ok);
      const changed = Object.keys(next).some((k) => next[k] !== accessRef.current[k]);
      if (!changed) return;
      // Entitled chapters without a local key: fetch them, then redraw (States: Error).
      const missing = state.chapters
        .filter((c) => c.access === 'unlocked' && !files.current?.hasKey(c.chapter_uid))
        .map((c) => c.chapter_uid);
      const apply = () => {
        const a = accessMap(state, files.current, true);
        setAccess(a);
        send({
          type: 'access.update',
          payload: { access: a, reload_section: true, gate_room: gateRoom.current },
        });
      };
      if (missing.length) void files.current!.refreshKeys(missing).then(apply, () => apply());
      else apply();
    });
  }, [state, phase, send]);

  // ─── Open the book once the bundle is ready and the files are prepared ─────
  const drawList = useMemo<DrawAnnotation[]>(
    () =>
      annotations.map((a) => ({
        id: a.id,
        kind: a.kind,
        color: a.color,
        cfi_range: a.cfi_range,
        para_id: a.start_para_id,
      })),
    [annotations],
  );

  const openBook = useCallback(() => {
    if (!ready.current || !manifest || !state || opened.current) return;
    opened.current = true;
    const p = state.position;
    // Each place carries its fallbacks (rule 11): the CFI on the same revision, then the paragraph,
    // then the saved chapter's start.
    const server: StartPosition = p
      ? {
          ...(p.revision_id === state.revision.id && p.cfi ? { cfi: p.cfi } : null),
          ...(p.para_id ? { para_id: p.para_id, offset: p.char_offset ?? 0 } : null),
          ...(p.chapter_uid ? { chapter_uid: p.chapter_uid } : null),
        }
      : {};
    const mine = localPos.current;
    const local: StartPosition | null =
      mine && (mine.revision_id === state.revision.id || mine.para_id || mine.chapter_uid)
        ? {
            ...(mine.revision_id === state.revision.id ? { cfi: mine.cfi } : null),
            ...(mine.para_id ? { para_id: mine.para_id, offset: mine.offset } : null),
            ...(mine.chapter_uid ? { chapter_uid: mine.chapter_uid } : null),
          }
        : null;
    // Rule 11: the server position if newer than this phone's, else this phone's. Rule 67: another
    // device more than 5% ahead is offered, and this phone's place stays (Stay is the default).
    let start: StartPosition = server;
    if (opts.startCfi) start = { cfi: opts.startCfi };
    else if (local && mine && p) {
      const otherDevice = p.device_id != null && p.device_id !== myDevice.current;
      if (otherDevice && p.percent > mine.percent + 5 && (server.cfi || server.para_id)) {
        start = local;
        setElsewhere({
          percent: Math.floor(p.percent),
          device: p.device_name,
          start: server.cfi ? { cfi: server.cfi } : { para_id: server.para_id!, offset: server.offset ?? 0 },
        });
      } else if (Date.parse(p.updated_at) <= mine.at) start = local;
    } else if (local) start = local;
    send({
      type: 'open',
      payload: {
        manifest: {
          book_id: manifest.book_id,
          revision_id: manifest.revision_id,
          total_words: manifest.total_words,
          preview_cut: manifest.preview_cut
            ? { chapter_uid: manifest.preview_cut.chapter_uid, para_id: manifest.preview_cut.para_id }
            : null,
          chapters: manifest.chapters.map((c) => ({
            chapter_uid: c.chapter_uid,
            ord: c.ord,
            title: c.title,
            kind: c.kind,
            words: c.words,
            words_before: c.words_before,
            pages: c.pages,
            price_credits: c.price_credits,
            paragraphs: c.paragraphs,
          })),
        },
        access,
        start,
        settings,
        annotations: drawList,
        gate_room: gateRoom.current,
      },
    });
    track('reader_opened', {
      book_id: bookId,
      source: opts.source ?? (opts.startCfi ? 'link' : 'direct'),
      owned: state.owns_book,
      percent: Math.floor(p?.percent ?? 0),
    });
  }, [manifest, state, access, settings, drawList, send, opts.startCfi, opts.source, track, bookId]);

  useEffect(() => {
    if (phase === 'ready') openBook();
  }, [phase, openBook]);

  // Card heights are measured natively; the page keeps room for them (rule 52–53).
  useEffect(() => {
    // Only the measured heights trigger this; access changes send their own update.
    if (opened.current)
      send({ type: 'access.update', payload: { access, reload_section: false, gate_room: opts.gateRoom } });
  }, [opts.gateRoom.preview, opts.gateRoom.chapter]);

  // ─── Progress (rule 66) ────────────────────────────────────────────────────
  const syncNow = useCallback(
    async (d: RelocateDetail | null = loc) => {
      if (!d || !state || !d.chapter_uid) return;
      clearTimeout(syncTimer.current);
      lastSync.current = Date.now();
      // The Library shows the new place when the reader goes back, online or not (flow 05 rule 34).
      applyProgress(qc, bookId, { percent: d.percent, chapter_uid: d.chapter_uid });
      const device = await deviceId().catch(() => null);
      await supabase.rpc('sync_reading_progress', {
        p_book: bookId,
        p_revision: state.revision.id,
        p_cfi: d.cfi,
        p_chapter_uid: d.chapter_uid,
        p_para_id: d.para_id ?? '',
        p_char_offset: d.offset,
        p_percent: d.percent,
        p_device_id: device ?? undefined,
        p_device_name: Device.modelName ?? undefined,
        p_at: new Date().toISOString(),
      } as never);
      // Flow 07 rule 24: rooms reading this book see the new place live (capped by the row above).
      const ord = files.current?.manifest?.chapters.find((c) => c.chapter_uid === d.chapter_uid)?.ord;
      if (ord != null) syncRoomProgress(bookId, d.percent, ord);
    },
    [bookId, loc, state, qc],
  );

  const onRelocate = useCallback(
    (d: RelocateDetail) => {
      setLoc(d);
      setSelection(null);
      lastActive.current = Date.now();
      if (state) {
        const lp: LocalPosition = {
          revision_id: state.revision.id,
          cfi: d.cfi,
          para_id: d.para_id,
          offset: d.offset,
          chapter_uid: d.chapter_uid,
          percent: d.percent,
          at: Date.now(),
        };
        localPos.current = lp;
        void AsyncStorage.setItem(posKey(bookId), JSON.stringify(lp)).catch(() => undefined);
      }
      const chapterChanged = d.chapter_uid !== lastChapter.current;
      lastChapter.current = d.chapter_uid;
      clearTimeout(syncTimer.current);
      if (chapterChanged || Date.now() - lastSync.current > PROGRESS_EVERY) void syncNow(d);
      else syncTimer.current = setTimeout(() => void syncNow(d), 2000);
    },
    [syncNow, state, bookId],
  );

  // ─── Reading sessions (rule 69): idle over 60 s pauses the clock ──────────
  const session = useRef<{ id: string; started: number; active: number; tick: number } | null>(null);
  const logSession = useCallback(
    async (end: boolean) => {
      const sess = session.current;
      if (!sess) return;
      if (end) session.current = null;
      if (sess.active < 1) return;
      const device = await deviceId().catch(() => null);
      await supabase.rpc('log_reading_session', {
        p_client_id: sess.id,
        p_book: bookId,
        p_device_id: device ?? undefined,
        p_started_at: new Date(sess.started).toISOString(),
        p_ended_at: new Date().toISOString(),
        p_active_seconds: Math.round(sess.active),
      } as never);
    },
    [bookId],
  );
  const reading = phase === 'ready' && loc != null;
  useEffect(() => {
    if (!reading) return;
    const now = Date.now();
    session.current ??= { id: Crypto.randomUUID(), started: now, active: 0, tick: now };
    let sinceLog = 0;
    const t = setInterval(() => {
      const sess = session.current;
      if (!sess) return;
      const at = Date.now();
      const step = (at - sess.tick) / 1000;
      sess.tick = at;
      if (at - lastActive.current <= IDLE_MS) sess.active += step;
      sinceLog += step * 1000;
      if (sinceLog >= SESSION_EVERY) {
        sinceLog = 0;
        void logSession(false);
      }
    }, 5000);
    return () => {
      clearInterval(t);
      void logSession(true);
    };
  }, [reading, logSession]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        void syncNow();
        void logSession(true);
      } else {
        lastActive.current = Date.now();
        if (phase === 'ready') {
          const now = Date.now();
          session.current ??= { id: Crypto.randomUUID(), started: now, active: 0, tick: now };
        }
        void qc.invalidateQueries({ queryKey: readerKey(bookId) });
      }
    });
    return () => sub.remove();
  }, [syncNow, logSession, qc, bookId, phase]);

  // ─── Charging (rules 54–58) ────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const fresh = await qc.fetchQuery({
      queryKey: readerKey(bookId),
      queryFn: async () => {
        const { data, error: e } = await supabase.rpc('get_reader_state', { p_book: bookId });
        if (e) throw e;
        return data as unknown as ReaderState;
      },
      staleTime: 0,
    });
    return fresh;
  }, [qc, bookId]);

  const unlockChapter = useCallback(
    async (chapterUid: string, source: 'tap' | 'auto'): Promise<{ ok: boolean; reason?: string }> => {
      if (!state || !files.current || !pending.current || !userId.current)
        return { ok: false, reason: 'not_ready' };
      setCharging(chapterUid);
      const key = chargeKey(
        pending.current,
        { user_id: userId.current, book_id: bookId, chapter_uid: chapterUid },
        () => Crypto.randomUUID(),
      );
      try {
        const { data, error: e } = await supabase.rpc('unlock_chapter', {
          p_book: bookId,
          p_chapter_uid: chapterUid,
          p_source: source,
          p_key: key,
        });
        if (e) throw e;
        const r = data as unknown as {
          status: 'ok' | 'already_unlocked';
          ledger_id: number | null;
          spent: number;
          undo_until: string | null;
          book_completed: boolean;
        };
        confirmCharge(pending.current, userId.current, chapterUid);
        // The key may lag the charge: the card stays busy while /keys is retried with backoff
        // (1, 2, 4 s); the access effect still retries on every later refresh.
        const want = r.book_completed ? undefined : [chapterUid];
        for (let i = 0; ; i++) {
          const fc = files.current;
          const got = await fc.refreshKeys(want).then(
            () => fc.hasKey(chapterUid),
            () => false,
          );
          if (got || i === 3) break;
          await new Promise((res) => setTimeout(res, 1000 * 2 ** i));
        }
        const fresh = await refresh();
        const ok = await files.current.licenceValid();
        const a = accessMap(fresh, files.current, ok);
        setAccess(a);
        send({
          type: 'access.update',
          payload: { access: a, reload_section: true, gate_room: gateRoom.current },
        });
        if (r.status === 'ok' && r.spent > 0) {
          askPush('unlock');
          track('chapter_unlocked', {
            chapter_ord: chapterNumber(fresh, chapterUid),
            price: r.spent,
            source,
          });
          setToast({
            chapter_uid: chapterUid,
            ord: chapterNumber(fresh, chapterUid),
            spent: r.spent,
            ledger_id: r.ledger_id,
            undo_until: r.undo_until ? Date.parse(r.undo_until) : Date.now() + 600_000,
          });
        }
        return { ok: a[chapterUid] === 'unlocked' || a[chapterUid] === 'open' };
      } catch (err) {
        const { code } = rpcError(err);
        track('chapter_unlock_failed', { reason: code === 'network' ? 'offline' : code });
        if (code === 'insufficient_credits') {
          confirmCharge(pending.current, userId.current, chapterUid);
          const price = state.chapters.find((c) => c.chapter_uid === chapterUid)?.price_credits ?? 0;
          track('low_balance_in_reader', { missing: Math.max(0, price - state.balance) });
          setLowFor(chapterUid);
          return { ok: false, reason: 'insufficient_credits' };
        }
        if (code === 'network') return { ok: false, reason: 'offline' };
        if (code === 'auto_off') confirmCharge(pending.current, userId.current, chapterUid);
        return { ok: false, reason: code };
      } finally {
        setCharging(null);
      }
    },
    [state, bookId, refresh, send, track, askPush],
  );

  const undo = useCallback(async () => {
    const t = toast;
    if (!t?.ledger_id || !files.current) return;
    setToast(null);
    const { error: e } = await supabase.rpc('undo_chapter_unlock', {
      p_ledger: t.ledger_id,
      p_key: Crypto.randomUUID(),
    });
    if (e) {
      const { code } = rpcError(e);
      // Codes from `undo_chapter_unlock` (flow 04 rule 59).
      setNotice(
        code === 'already_read'
          ? 'You’ve already read this chapter'
          : code === 'undo_expired'
            ? 'Undo has run out. You can ask Support to return it.'
            : code === 'book_unlocked'
              ? 'You unlocked the whole book, so this can’t be undone'
              : code === 'already_undone'
                ? 'This chapter was already returned'
                : 'Couldn’t undo that. Try again.',
      );
      return;
    }
    track('chapter_undo', {
      seconds_since: Math.max(0, Math.round((Date.now() - (t.undo_until - 600_000)) / 1000)),
    });
    files.current.forgetKey(t.chapter_uid);
    const fresh = await refresh();
    const a = accessMap(fresh, files.current, await files.current.licenceValid());
    setAccess(a);
    send({
      type: 'access.update',
      payload: { access: a, reload_section: true, gate_room: gateRoom.current },
    });
    // Inside the returned chapter: move back to the end of the chapter before it.
    if (loc?.chapter_uid === t.chapter_uid && manifest) {
      const i = manifest.chapters.findIndex((c) => c.chapter_uid === t.chapter_uid);
      const last = i > 0 ? manifest.chapters[i - 1]?.paragraphs.at(-1) : undefined;
      if (last) send({ type: 'goTo', payload: { para_id: last.id } });
    }
    setNotice(`Chapter ${t.ord} returned · ${t.spent} credits back`);
  }, [toast, refresh, send, loc?.chapter_uid, manifest, track]);

  // ─── Bridge (rule D) ───────────────────────────────────────────────────────
  const onMessage = useCallback(
    async (
      raw: string,
      ui: {
        onTap: (zone: 'left' | 'center' | 'right') => void;
        onMarker: (para: string) => void;
        onAnnotation: (id: string, rect: Rect) => void;
      },
    ) => {
      const m = parseFromWeb(raw);
      if (!m) {
        // The message itself may hold book text, so only the fact is sent.
        captureError(new Error('reader: unknown bridge message'), {
          book_id: bookId,
          bundle_version: BRIDGE_VERSION,
        });
        return;
      }
      switch (m.type) {
        case 'ready':
          ready.current = true;
          opened.current = false;
          openBook();
          return;
        case 'resource.request': {
          const id = m.id!;
          try {
            const bytes = await files.current!.read(m.payload.path, accessRef.current);
            send(
              bytes
                ? { type: 'resource.response', reply_to: id, payload: { bytes_b64: b64(bytes) } }
                : { type: 'resource.response', reply_to: id, payload: { error: 'missing' } },
            );
          } catch (e) {
            send({
              type: 'resource.response',
              reply_to: id,
              payload: { error: String((e as Error).message ?? e) },
            });
          }
          return;
        }
        case 'relocate':
          if (!readyTracked.current) {
            readyTracked.current = true;
            track('reader_ready_ms', { ms: Date.now() - openedAt.current });
          }
          onRelocate(m.payload);
          return;
        case 'start.moved':
          setNotice('Your place moved a little after an update');
          return;
        case 'tap':
          lastActive.current = Date.now();
          if (m.payload.zone === 'left') send({ type: 'prev', payload: { unit: 'page' } });
          else if (m.payload.zone === 'right') send({ type: 'next', payload: { unit: 'page' } });
          ui.onTap(m.payload.zone);
          return;
        case 'advance.request': {
          const id = m.id!;
          const { gate_kind, from_chapter_uid } = m.payload;
          // The preview cut holds until the reader picks a way to pay; with Pay as you read it charges
          // the rest of that chapter like any locked chapter (rules 52, 54).
          if (gate_kind === 'preview' && !payGo.current) {
            track('page_turn_held', { gate_kind });
            send({ type: 'advance.decision', reply_to: id, payload: { allow: false, reason: 'preview' } });
            return;
          }
          if (!settings.auto_unlock) {
            track('page_turn_held', { gate_kind });
            send({ type: 'advance.decision', reply_to: id, payload: { allow: false, reason: 'auto_off' } });
            return;
          }
          // No answer in 5 s: tell the reader, keep holding; the same key is reused on retry (rule 55).
          const slow = setTimeout(() => setNotice('Still working. Check your connection.'), 5000);
          const r = await unlockChapter(from_chapter_uid, 'auto');
          clearTimeout(slow);
          if (r.reason === 'offline') setNotice('Connect to unlock this chapter');
          if (!r.ok) track('page_turn_held', { gate_kind });
          send({ type: 'advance.decision', reply_to: id, payload: { allow: r.ok, reason: r.reason } });
          return;
        }
        case 'selection':
          setSelection(m.payload);
          if (m.payload.clipped) setNotice('That’s a long passage. Highlight a shorter piece.');
          return;
        case 'selection.cleared':
          setSelection(null);
          return;
        case 'marker.tap':
          ui.onMarker(m.payload.para_id);
          return;
        case 'annotation.tap':
          ui.onAnnotation(m.payload.id, m.payload.rect);
          return;
        case 'search.result':
          setSearch((cur) =>
            cur
              ? { ...cur, items: m.payload.items, locked_left: m.payload.locked_left, done: m.payload.done }
              : cur,
          );
          return;
        case 'error':
          // Missing or undecryptable files were already fetched again once in BookFiles.read (rule 19).
          setPhase('error');
          setError(m.payload.detail);
          track('reader_error', { code: m.payload.code });
          captureError(new Error(`reader ${m.payload.code}: ${m.payload.detail}`), {
            book_id: bookId,
            revision_id: files.current?.revisionId,
            chapter_uid: m.payload.chapter_uid ?? lastChapter.current,
            bundle_version: BRIDGE_VERSION,
          });
          return;
        default:
          return;
      }
    },
    [openBook, onRelocate, send, settings.auto_unlock, unlockChapter, bookId, track],
  );

  // ─── Settings (rule 63) ────────────────────────────────────────────────────
  const changeSetting = useCallback(
    async <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
      const next = { ...settings, [key]: value };
      setSettings(next);
      send({ type: 'settings.apply', payload: next });
      track('settings_changed', { key });
      const { error: e } = await supabase.rpc('set_reader_setting', {
        p_key: key,
        p_value: settingValue(key, value) as never,
      });
      if (e) setNotice('Couldn’t save that setting. It still applies on this phone.');
    },
    [settings, send, track],
  );

  // ─── Annotation sync (rule 43): offline writes wait on the phone ──────────
  const [unsaved, setUnsaved] = useState<ReadonlySet<string>>(new Set());
  const loadUnsaved = useCallback(async () => {
    const uid = userId.current;
    const rows = uid ? await queuedAnnotations(uid) : [];
    setUnsaved(new Set(rows.filter((r) => r.book_id === bookId).map((r) => r.client_id)));
  }, [bookId]);

  const saveRows = useCallback(
    async (rows: AnnotationRow[]) => {
      const r = await saveAnnotations(userId.current, rows);
      // The highlight stays drawn either way; a queued one is sent when the network is back.
      if (r === 'queued') setNotice('Saved on this phone. It will sync when you’re back online.');
      else if (r === 'refused') setNotice('Couldn’t save that. Try again.');
      if (r === 'queued' || unsaved.size) void loadUnsaved();
    },
    [loadUnsaved, unsaved.size],
  );

  const online = useOnline();
  useEffect(() => {
    const uid = userId.current;
    if (!uid || phase !== 'ready') return;
    if (online)
      void flushAnnotations(uid)
        .catch(() => 0)
        .then(loadUnsaved);
    else void loadUnsaved();
  }, [online, phase, loadUnsaved]);

  // ─── Passage markers (rule 46): counts per chapter, only up to the furthest place ──
  const markerCounts = useRef(new Map<string, { para_id: string; count: number }[]>());
  const markerChapter = loc?.chapter_uid ?? null;
  useEffect(() => {
    markerCounts.current.clear();
  }, [bookId, revisionId]);
  useEffect(() => {
    // Fetched again on each chapter visit: further reading reveals more markers.
    if (!markerChapter || phase !== 'ready' || !online) return;
    let live = true;
    void supabase
      .rpc('get_passage_counts', { p_book: bookId, p_chapter_uids: [markerChapter] })
      .then(({ data, error }) => {
        if (!live || error) return;
        markerCounts.current.set(markerChapter, (data ?? []) as { para_id: string; count: number }[]);
        send({ type: 'markers.set', payload: { list: [...markerCounts.current.values()].flat() } });
      });
    return () => {
      live = false;
    };
  }, [markerChapter, phase, online, bookId, send]);

  // ─── Highlights (rules 35, 41) ─────────────────────────────────────────────
  const highlight = useCallback(
    async (color: HighlightColor, note?: string, from?: SelectionDetail, shareGroup?: string | null) => {
      const sel = from ?? selection;
      if (!sel || !state) return;
      const a: Annotation = {
        id: Crypto.randomUUID(),
        client_id: Crypto.randomUUID(),
        kind: note ? 'note' : 'highlight',
        color,
        cfi_range: sel.cfi_range,
        chapter_uid: sel.chapter_uid,
        start_para_id: sel.para_id_start,
        quote: sel.text.slice(0, 500),
        note_text: note ?? null,
        visibility: shareGroup ? 'club' : 'private',
      };
      setAnnotations((l) => [...l, a]);
      if (note) track('note_saved', { shared: !!shareGroup });
      else track('highlight_created', { color });
      send({
        type: 'annotations.set',
        payload: {
          list: [{ id: a.id, kind: a.kind, color, cfi_range: a.cfi_range, para_id: a.start_para_id }],
          replace: false,
        },
      });
      send({ type: 'selection.clear' });
      setSelection(null);
      await saveRows([
        {
          client_id: a.client_id,
          book_id: bookId,
          revision_id: state.revision.id,
          kind: a.kind,
          color,
          cfi_range: a.cfi_range,
          chapter_uid: a.chapter_uid,
          start_para_id: sel.para_id_start,
          start_char: 0,
          end_para_id: sel.para_id_end ?? sel.para_id_start,
          end_char: 0,
          quote: a.quote,
          note_text: a.note_text,
          visibility: shareGroup ? 'club' : 'private',
          shared_group_id: shareGroup ?? null,
          updated_at: new Date().toISOString(),
        },
      ]);
    },
    [selection, state, bookId, send, saveRows, track],
  );

  /** Add, edit or clear the note on an existing highlight (rule 36). Last write wins (rule 43). */
  const editNote = useCallback(
    async (clientId: string, text: string, shareGroup?: string | null) => {
      const a = annotations.find((x) => x.client_id === clientId);
      if (!a || !state) return;
      const next: Annotation = {
        ...a,
        kind: text ? 'note' : 'highlight',
        note_text: text || null,
        visibility: shareGroup && text ? 'club' : 'private',
      };
      setAnnotations((l) => l.map((x) => (x.client_id === clientId ? next : x)));
      if (text) track('note_saved', { shared: !!shareGroup });
      send({
        type: 'annotations.set',
        payload: {
          list: [
            { id: a.id, kind: next.kind, color: a.color, cfi_range: a.cfi_range, para_id: a.start_para_id },
          ],
          replace: false,
        },
      });
      await saveRows([
        {
          client_id: a.client_id,
          book_id: bookId,
          revision_id: state.revision.id,
          kind: next.kind,
          color: a.color,
          cfi_range: a.cfi_range,
          chapter_uid: a.chapter_uid,
          start_para_id: a.start_para_id,
          end_para_id: a.start_para_id,
          quote: a.quote,
          note_text: next.note_text,
          visibility: next.visibility,
          shared_group_id: next.visibility === 'club' ? shareGroup : null,
          updated_at: new Date().toISOString(),
        },
      ]);
    },
    [annotations, state, bookId, send, saveRows, track],
  );

  // ─── Bookmarks (rule 40) ───────────────────────────────────────────────────
  const bookmarks = useMemo(() => annotations.filter((a) => a.kind === 'bookmark'), [annotations]);
  /** The bookmark on the page on screen: same chapter and its start paragraph is on this page. */
  const pageBookmark = useMemo(() => {
    if (!loc) return null;
    return (
      bookmarks.find(
        (b) => b.cfi_range === loc.cfi || (b.start_para_id != null && b.start_para_id === loc.start_para),
      ) ?? null
    );
  }, [bookmarks, loc]);

  const toggleBookmark = useCallback(async () => {
    if (!loc || !state) return;
    const existing = pageBookmark;
    const a: Annotation = existing ?? {
      id: Crypto.randomUUID(),
      client_id: Crypto.randomUUID(),
      kind: 'bookmark',
      color: 'yellow',
      cfi_range: loc.cfi,
      chapter_uid: loc.chapter_uid,
      start_para_id: loc.start_para ?? loc.para_id,
      quote: null,
      note_text: null,
      visibility: 'private',
    };
    if (!existing && bookmarks.length >= 200) {
      setNotice('You can keep 200 bookmarks in a book. Remove one first.');
      return;
    }
    setAnnotations((l) => (existing ? l.filter((x) => x.client_id !== a.client_id) : [...l, a]));
    setNotice(existing ? 'Bookmark removed' : 'Page bookmarked');
    await saveRows([
      {
        client_id: a.client_id,
        book_id: bookId,
        revision_id: state.revision.id,
        kind: 'bookmark',
        cfi_range: a.cfi_range,
        chapter_uid: a.chapter_uid,
        start_para_id: a.start_para_id,
        end_para_id: a.start_para_id,
        quote: a.quote,
        visibility: 'private',
        deleted: !!existing,
        updated_at: new Date().toISOString(),
      },
    ]);
  }, [loc, state, pageBookmark, bookmarks.length, bookId, saveRows]);

  // ─── Highlight menu: colour and delete (rule 36) ───────────────────────────
  const saveOne = useCallback(
    async (a: Annotation, deleted = false) => {
      if (!state) return;
      await saveRows([
        {
          client_id: a.client_id,
          book_id: bookId,
          revision_id: state.revision.id,
          kind: a.kind,
          color: a.color,
          cfi_range: a.cfi_range,
          chapter_uid: a.chapter_uid,
          start_para_id: a.start_para_id,
          end_para_id: a.start_para_id,
          quote: a.quote,
          note_text: a.note_text,
          visibility: a.visibility,
          deleted,
          updated_at: new Date().toISOString(),
        },
      ]);
    },
    [state, bookId, saveRows],
  );
  const draw = useCallback(
    (a: Annotation) =>
      send({
        type: 'annotations.set',
        payload: {
          list: [
            { id: a.id, kind: a.kind, color: a.color, cfi_range: a.cfi_range, para_id: a.start_para_id },
          ],
          replace: false,
        },
      }),
    [send],
  );

  const recolor = useCallback(
    async (clientId: string, color: HighlightColor) => {
      const a = annotations.find((x) => x.client_id === clientId);
      if (!a || a.color === color) return;
      const next = { ...a, color };
      setAnnotations((l) => l.map((x) => (x.client_id === clientId ? next : x)));
      draw(next);
      await saveOne(next);
    },
    [annotations, draw, saveOne],
  );

  /** Deletes at once; the returned function puts it back (the Undo toast, 5 s). */
  const removeAnnotation = useCallback(
    async (clientId: string) => {
      const a = annotations.find((x) => x.client_id === clientId);
      if (!a) return null;
      setAnnotations((l) => l.filter((x) => x.client_id !== clientId));
      send({ type: 'annotations.set', payload: { list: [], replace: false, remove: [a.id] } });
      void saveOne(a, true);
      return () => {
        setAnnotations((l) => [...l, a]);
        draw(a);
        void saveOne(a, false);
      };
    },
    [annotations, send, draw, saveOne],
  );

  // ─── Search in book (rule 25): runs in the bundle over open text only ──────
  const runSearch = useCallback(
    (query: string) => {
      const qy = query.trim();
      if (!qy) {
        setSearch(null);
        return;
      }
      setSearch({ query: qy, items: [], locked_left: false, done: false });
      send({ type: 'search', payload: { query: qy } });
    },
    [send],
  );

  // ─── Pay the rest (rule 61): every key, fresh links, no more chapter stops ─
  const afterBookUnlocked = useCallback(async () => {
    if (!files.current) return;
    await files.current.refreshLinks().catch(() => files.current?.refreshKeys().catch(() => undefined));
    const fresh = await refresh();
    const a = accessMap(fresh, files.current, await files.current.licenceValid());
    setAccess(a);
    send({
      type: 'access.update',
      payload: { access: a, reload_section: true, gate_room: gateRoom.current },
    });
    // The whole book downloads for offline reading (s-pay-rest); a failure retries on next open.
    void files.current.downloadAll().catch(() => undefined);
  }, [refresh, send]);

  // ─── Report a problem (rule 26) ────────────────────────────────────────────
  const reportProblem = useCallback(
    async (note: string) => {
      if (!state) throw new Error('not_ready');
      const { error: e } = await supabase.rpc('report_book_problem', {
        p_book: bookId,
        p_revision: state.revision.id,
        p_chapter_uid: loc?.chapter_uid ?? undefined,
        p_cfi: loc?.cfi ?? '',
        p_note: note.trim() || undefined,
      } as never);
      if (e) throw e;
    },
    [state, bookId, loc],
  );

  return {
    q,
    state,
    bookmarks,
    pageBookmark,
    toggleBookmark,
    reportProblem,
    editNote,
    recolor,
    removeAnnotation,
    search,
    runSearch,
    clearSearch: () => setSearch(null),
    afterBookUnlocked,
    elsewhere,
    clearElsewhere: () => setElsewhere(null),
    goTo: (payload: { cfi: string } | { chapter_uid: string } | { para_id: string; offset?: number }) =>
      send({ type: 'goTo', payload }),
    phase,
    error,
    manifest,
    loc,
    access,
    settings,
    selection,
    toast,
    charging,
    lowFor,
    notice,
    annotations,
    unsaved,
    web,
    send,
    onMessage,
    unlockChapter,
    undo,
    changeSetting,
    highlight,
    refresh,
    syncNow,
    clearToast: () => setToast(null),
    clearNotice: () => setNotice(null),
    clearLow: () => setLowFor(null),
    clearSelection: () => {
      send({ type: 'selection.clear' });
      setSelection(null);
    },
    /** Expired licence offline (rule 71): open the free preview with `K_free`. */
    readPreview: () => {
      previewOnly.current = true;
      files.current = null;
      setPhase('loading');
      setAttempt((n) => n + 1);
    },
    retry: () => {
      previewOnly.current = false;
      files.current = null;
      opened.current = false;
      ready.current = false;
      setPhase('loading');
      setAttempt((n) => n + 1);
      void q.refetch();
    },
  };
}

/** Pulled annotations with this phone's unsent writes on top (a queued delete hides its row). */
function withQueued(pulled: Annotation[], waiting: AnnotationRow[]): Annotation[] {
  if (!waiting.length) return pulled;
  const ids = new Set(waiting.map((r) => r.client_id));
  const out = pulled.filter((a) => !ids.has(a.client_id));
  for (const r of waiting) {
    if (r.deleted) continue;
    const old = pulled.find((a) => a.client_id === r.client_id);
    out.push({
      id: old?.id ?? r.client_id,
      client_id: r.client_id,
      kind: r.kind as Annotation['kind'],
      color: ((r.color as HighlightColor | undefined) ?? 'yellow') as HighlightColor,
      cfi_range: r.cfi_range as string,
      chapter_uid: (r.chapter_uid as string | null) ?? null,
      start_para_id: (r.start_para_id as string | null) ?? null,
      quote: (r.quote as string | null) ?? null,
      note_text: (r.note_text as string | null) ?? null,
      visibility: 'private',
      updated_at: r.updated_at,
    });
  }
  return out;
}

/** "Chapter n": the chapter's number among chapters (parts aren't counted). */
export function chapterNumber(
  s: { chapters: { chapter_uid: string; kind: string; ord: number }[] },
  uid: string,
) {
  const c = s.chapters.find((x) => x.chapter_uid === uid);
  if (!c) return 0;
  return s.chapters.filter((x) => x.kind === 'chapter' && x.ord <= c.ord).length;
}
