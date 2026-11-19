// The native half of the reader (flow 04 A, B, I, K): opens the book in the bundle, answers its
// file requests with decrypted bytes, holds and charges forward moves at gates, keeps the place.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
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
} from '@arpedia/reader';
import { supabase } from '@/lib/supabase';
import { rpcError } from '../03/UnlockSheet';
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
import { deviceId, WorkerError } from './worker';

export type ReaderPhase = 'loading' | 'ready' | 'error' | 'offline' | 'expired';

export interface UnlockedToast {
  chapter_uid: string;
  ord: number;
  spent: number;
  ledger_id: number | null;
  undo_until: number;
}

interface Annotation {
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

export function useReader(bookId: string, opts: { gateRoom: GateRoom; startCfi?: string }) {
  const qc = useQueryClient();
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
      userId.current = (await supabase.auth.getSession()).data.session?.user.id ?? null;
      try {
        await f.refreshLinks();
      } catch (e) {
        if (!(e instanceof WorkerError) || e.code !== 'offline') throw e;
        if (!(await f.loadStoredKeys())) {
          if (live) setPhase('offline');
          return;
        }
      }
      const m = await f.loadManifest();
      const ok = await f.licenceValid();
      if (!live) return;
      setManifest(m);
      setAccess(accessMap(state, f, ok));
      const { data } = await supabase.rpc('pull_annotations', { p_book: bookId });
      const items = ((data as { items?: Annotation[] } | null)?.items ?? []).filter((a) => !a.deleted);
      if (live) setAnnotations(items);
      setPhase('ready');
    })().catch((e) => {
      if (!live) return;
      setError(String((e as Error)?.message ?? e));
      setPhase(e instanceof WorkerError && e.code === 'offline' ? 'offline' : 'error');
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
    const start = opts.startCfi
      ? { cfi: opts.startCfi }
      : p && p.revision_id === state.revision.id && p.cfi
        ? { cfi: p.cfi }
        : p?.para_id
          ? { para_id: p.para_id, offset: p.char_offset ?? 0 }
          : {};
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
  }, [manifest, state, access, settings, drawList, send, opts.startCfi]);

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
        p_device_name: undefined,
        p_at: new Date().toISOString(),
      } as never);
    },
    [bookId, loc, state],
  );

  const onRelocate = useCallback(
    (d: RelocateDetail) => {
      setLoc(d);
      setSelection(null);
      const chapterChanged = d.chapter_uid !== lastChapter.current;
      lastChapter.current = d.chapter_uid;
      clearTimeout(syncTimer.current);
      if (chapterChanged || Date.now() - lastSync.current > PROGRESS_EVERY) void syncNow(d);
      else syncTimer.current = setTimeout(() => void syncNow(d), 2000);
    },
    [syncNow],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void syncNow();
      else void qc.invalidateQueries({ queryKey: readerKey(bookId) });
    });
    return () => sub.remove();
  }, [syncNow, qc, bookId]);

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
        // The key may lag the charge: retried by the access effect on every refresh.
        await files.current.refreshKeys(r.book_completed ? undefined : [chapterUid]).catch(() => undefined);
        const fresh = await refresh();
        const ok = await files.current.licenceValid();
        const a = accessMap(fresh, files.current, ok);
        setAccess(a);
        send({
          type: 'access.update',
          payload: { access: a, reload_section: true, gate_room: gateRoom.current },
        });
        if (r.status === 'ok' && r.spent > 0) {
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
        if (code === 'insufficient_credits') {
          confirmCharge(pending.current, userId.current, chapterUid);
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
    [state, bookId, refresh, send],
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
      setNotice(
        code === 'read_too_far'
          ? 'You’ve already read this chapter'
          : code === 'undo_expired'
            ? 'Undo has run out. You can ask Support to return it.'
            : 'Couldn’t undo that. Try again.',
      );
      return;
    }
    files.current.forgetKey(t.chapter_uid);
    const fresh = await refresh();
    const a = accessMap(fresh, files.current, await files.current.licenceValid());
    setAccess(a);
    send({
      type: 'access.update',
      payload: { access: a, reload_section: true, gate_room: gateRoom.current },
    });
    setNotice(`Chapter ${t.ord} returned · ${t.spent} credits back`);
  }, [toast, refresh, send]);

  // ─── Bridge (rule D) ───────────────────────────────────────────────────────
  const onMessage = useCallback(
    async (
      raw: string,
      ui: {
        onTap: (zone: 'left' | 'center' | 'right') => void;
        onMarker: (para: string) => void;
        onAnnotation: (id: string) => void;
      },
    ) => {
      const m = parseFromWeb(raw);
      if (!m) return;
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
          onRelocate(m.payload);
          return;
        case 'tap':
          if (m.payload.zone === 'left') send({ type: 'prev', payload: { unit: 'page' } });
          else if (m.payload.zone === 'right') send({ type: 'next', payload: { unit: 'page' } });
          ui.onTap(m.payload.zone);
          return;
        case 'advance.request': {
          const id = m.id!;
          const { gate_kind, from_chapter_uid } = m.payload;
          if (gate_kind === 'preview') {
            send({ type: 'advance.decision', reply_to: id, payload: { allow: false, reason: 'preview' } });
            return;
          }
          if (!settings.auto_unlock) {
            send({ type: 'advance.decision', reply_to: id, payload: { allow: false, reason: 'auto_off' } });
            return;
          }
          // No answer in 5 s: tell the reader, keep holding; the same key is reused on retry (rule 55).
          const slow = setTimeout(() => setNotice('Still working. Check your connection.'), 5000);
          const r = await unlockChapter(from_chapter_uid, 'auto');
          clearTimeout(slow);
          if (r.reason === 'offline') setNotice('Connect to unlock this chapter');
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
          ui.onAnnotation(m.payload.id);
          return;
        case 'error':
          if (m.payload.code === 'resource_missing' || m.payload.code === 'decrypt_failed') setPhase('error');
          else setPhase('error');
          setError(m.payload.detail);
          return;
        default:
          return;
      }
    },
    [openBook, onRelocate, send, settings.auto_unlock, unlockChapter],
  );

  // ─── Settings (rule 63) ────────────────────────────────────────────────────
  const changeSetting = useCallback(
    async <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
      const next = { ...settings, [key]: value };
      setSettings(next);
      send({ type: 'settings.apply', payload: next });
      const { error: e } = await supabase.rpc('set_reader_setting', {
        p_key: key,
        p_value: settingValue(key, value) as never,
      });
      if (e) setNotice('Couldn’t save that setting. It still applies on this phone.');
    },
    [settings, send],
  );

  // ─── Highlights (rules 35, 41) ─────────────────────────────────────────────
  const highlight = useCallback(
    async (color: HighlightColor, note?: string) => {
      const sel = selection;
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
        visibility: 'private',
      };
      setAnnotations((l) => [...l, a]);
      send({
        type: 'annotations.set',
        payload: {
          list: [{ id: a.id, kind: a.kind, color, cfi_range: a.cfi_range, para_id: a.start_para_id }],
          replace: false,
        },
      });
      send({ type: 'selection.clear' });
      setSelection(null);
      const { error: e } = await supabase.rpc('upsert_annotations', {
        p_batch: [
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
            visibility: 'private',
            updated_at: new Date().toISOString(),
          },
        ] as never,
      });
      // The highlight stays drawn; the Notes screen marks it "Not saved yet" (States: Error).
      if (e) setNotice('Saved on this phone. It will sync when you’re back online.');
    },
    [selection, state, bookId, send],
  );

  return {
    q,
    state,
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
    retry: () => {
      files.current = null;
      opened.current = false;
      ready.current = false;
      setPhase('loading');
      setAttempt((n) => n + 1);
      void q.refetch();
    },
  };
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
