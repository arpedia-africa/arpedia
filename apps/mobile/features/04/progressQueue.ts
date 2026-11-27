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
