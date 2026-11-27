// Reading positions that could not reach the server (flow 04 rule 66): offline, a failed call, or
// maintenance mode. Only the newest position per book is kept, with the time it was read, and it is
// sent when the reader is back online (the reader and the Library both flush it).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { rpcError } from '../03/UnlockSheet';
import { inMaintenance } from '../16/config';

/** No connection or an expired session: worth sending again later; anything else the server refused. */
const retryLater = (e: unknown) => ['network', 'signed_out'].includes(rpcError(e).code);

const KEY = 'reader.progress.queue';

/** `sync_reading_progress` arguments, as the reader sends them. */
export type ProgressArgs = Record<string, unknown> & { p_book: string; p_at: string };

async function load(): Promise<Record<string, ProgressArgs>> {
  const raw = await AsyncStorage.getItem(KEY).catch(() => null);
  return raw ? (JSON.parse(raw) as Record<string, ProgressArgs>) : {};
}
const store = (q: Record<string, ProgressArgs>) =>
  (Object.keys(q).length ? AsyncStorage.setItem(KEY, JSON.stringify(q)) : AsyncStorage.removeItem(KEY)).catch(
    () => undefined,
  );

/** Keep this position for later; an older one for the same book is replaced. */
export async function queueProgress(args: ProgressArgs) {
  const q = await load();
  const cur = q[args.p_book];
  if (!cur || cur.p_at <= args.p_at) q[args.p_book] = args;
  await store(q);
}

/** Send now, or keep it for later when it can't go. */
export async function sendProgress(args: ProgressArgs): Promise<boolean> {
  if (inMaintenance()) return (void (await queueProgress(args)), false);
  const { error } = await supabase.rpc('sync_reading_progress', args as never);
  if (!error) {
    // A newer place for this book just went up: an older queued one must not follow it.
    const q = await load();
    if (q[args.p_book] && q[args.p_book]!.p_at <= args.p_at) {
      delete q[args.p_book];
      await store(q);
    }
    return true;
  }
  if (retryLater(error)) await queueProgress(args);
  return false;
}

let flushing = false;
/** Send every queued position (oldest book first). One that fails stays for the next try. */
export async function flushProgress() {
  void flushSessions();
  if (flushing || inMaintenance()) return;
  flushing = true;
  try {
    const q = await load();
    for (const args of Object.values(q).sort((a, b) => a.p_at.localeCompare(b.p_at))) {
      const { error } = await supabase.rpc('sync_reading_progress', args as never);
      if (error && retryLater(error)) break;
      const now = await load();
      if (now[args.p_book]?.p_at === args.p_at) delete now[args.p_book];
      await store(now);
    }
  } finally {
    flushing = false;
  }
}

// ─── Reading sessions (flow 04 rule 69, flow 15 rule 27) ─────────────────────
// A session read offline is the point of the offline share, so one that can't go up waits here,
// keyed by its client id (the server upserts on it, so the newest copy of a session wins).
const SESSIONS_KEY = 'reader.sessions.queue';
/** Oldest sessions are dropped past this; the reading stats are a sample, not a ledger. */
const MAX_SESSIONS = 200;

/** `log_reading_session` arguments, as the reader sends them. */
export type SessionArgs = Record<string, unknown> & { p_client_id: string; p_ended_at: string };

async function loadSessions(): Promise<Record<string, SessionArgs>> {
  const raw = await AsyncStorage.getItem(SESSIONS_KEY).catch(() => null);
  return raw ? (JSON.parse(raw) as Record<string, SessionArgs>) : {};
}
const storeSessions = (q: Record<string, SessionArgs>) =>
  (Object.keys(q).length
    ? AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(q))
    : AsyncStorage.removeItem(SESSIONS_KEY)
  ).catch(() => undefined);

async function queueSession(args: SessionArgs) {
  const q = await loadSessions();
  q[args.p_client_id] = args;
  const keep = Object.values(q)
    .sort((a, b) => b.p_ended_at.localeCompare(a.p_ended_at))
    .slice(0, MAX_SESSIONS);
  await storeSessions(Object.fromEntries(keep.map((s) => [s.p_client_id, s])));
}

/** Send a session now, or keep it for later when it can't go. */
export async function sendSession(args: SessionArgs): Promise<void> {
  if (inMaintenance()) return queueSession(args);
  const { error } = await supabase.rpc('log_reading_session', args as never);
  if (!error) {
    const q = await loadSessions();
    if (q[args.p_client_id]) {
      delete q[args.p_client_id];
      await storeSessions(q);
    }
  } else if (retryLater(error)) await queueSession(args);
}

let flushingSessions = false;
/** Send every queued session (oldest first). One that can't go yet stays for the next try. */
export async function flushSessions() {
  if (flushingSessions || inMaintenance()) return;
  flushingSessions = true;
  try {
    const q = await loadSessions();
    for (const args of Object.values(q).sort((a, b) => a.p_ended_at.localeCompare(b.p_ended_at))) {
      const { error } = await supabase.rpc('log_reading_session', args as never);
      if (error && retryLater(error)) break;
      const now = await loadSessions();
      if (now[args.p_client_id]?.p_ended_at === args.p_ended_at) delete now[args.p_client_id];
      await storeSessions(now);
    }
  } finally {
    flushingSessions = false;
  }
}
