// Annotations written while offline (flow 04 rule 43): kept on this phone per reader and sent with
// `upsert_annotations` when the network is back. The newest write per `client_id` wins, as on the
// server, so a highlight changed twice offline sends once.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { rpcError } from '../03/UnlockSheet';

/** One `upsert_annotations` batch row, as the RPC takes it. */
export type AnnotationRow = { client_id: string; updated_at: string } & Record<string, unknown>;

const BATCH = 200;
const queueKey = (userId: string) => `reader.annotations.queue.${userId}`;

async function load(userId: string): Promise<AnnotationRow[]> {
  const raw = await AsyncStorage.getItem(queueKey(userId)).catch(() => null);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as AnnotationRow[];
  } catch {
    return [];
  }
}

async function store(userId: string, rows: AnnotationRow[]) {
  if (rows.length) await AsyncStorage.setItem(queueKey(userId), JSON.stringify(rows)).catch(() => undefined);
  else await AsyncStorage.removeItem(queueKey(userId)).catch(() => undefined);
}

/** Newest write per client_id wins (rule 43). */
function merge(into: AnnotationRow[], rows: AnnotationRow[]) {
  const byId = new Map(into.map((r) => [r.client_id, r]));
  for (const r of rows) {
    const cur = byId.get(r.client_id);
    if (!cur || cur.updated_at <= r.updated_at) byId.set(r.client_id, r);
  }
  return [...byId.values()];
}

/** No connection or an expired session: worth sending again later. */
function retryLater(e: unknown) {
  const { code } = rpcError(e);
  return code === 'network' || code === 'signed_out';
}

async function upsert(rows: AnnotationRow[]) {
  const { error } = await supabase.rpc('upsert_annotations', { p_batch: rows as never });
  return error;
}

/** Rows still waiting to be sent for this reader. */
export function queuedAnnotations(userId: string): Promise<AnnotationRow[]> {
  return load(userId);
}

/**
 * Sends the queue. A lost connection keeps every row; a refused batch is retried row by row, so one
 * row the server refuses (a gate moved, the bookmark limit) is dropped without holding back the
 * rest. Returns how many rows are still waiting.
 */
export async function flushAnnotations(userId: string): Promise<number> {
  const rows = await load(userId);
  if (!rows.length) return 0;
  const done = new Set<AnnotationRow>();
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const e = await upsert(batch);
    if (!e) batch.forEach((r) => done.add(r));
    else if (retryLater(e)) break;
    else {
      let stop = false;
      for (const r of batch) {
        const one = await upsert([r]);
        if (one && retryLater(one)) {
          stop = true;
          break;
        }
        done.add(r);
      }
      if (stop) break;
    }
  }
  // Rows written while this ran stay queued: only what was sent, at the version sent, is removed.
  const sent = new Map([...done].map((r) => [r.client_id, r.updated_at]));
  const left = (await load(userId)).filter((r) => sent.get(r.client_id) !== r.updated_at);
  await store(userId, left);
  return left.length;
}

/**
 * Saves rows now, or keeps them on this phone when the connection is down. `queued` means they wait
 * on the phone; `refused` means the server said no (nothing is kept).
 */
export async function saveAnnotations(
  userId: string | null,
  rows: AnnotationRow[],
): Promise<'saved' | 'queued' | 'refused'> {
  const e = await upsert(rows);
  if (!e) return 'saved';
  if (!retryLater(e) || !userId) return 'refused';
  await store(userId, merge(await load(userId), rows));
  return 'queued';
}
