// Flow 15 · fcm-receipts (Server). Expo hands out receipts about 15 minutes after a send; this
// polls pushes sent 15 minutes to 24 hours ago and applies them. apply_push_receipts only moves a
// status forward, so receipts that come twice or out of order are harmless.
import type { Json } from '@arpedia/core';
import { serviceDb } from '../../db';
import type { Env } from '../../env';
import { pushSender } from './sender';

export async function pollReceipts(env: Env, now = new Date()): Promise<number> {
  const db = serviceDb(env);
  const { data, error } = await db
    .from('push_log')
    .select('id, ticket_ids, data')
    .eq('status', 'sent')
    .lt('sent_at', new Date(now.getTime() - 15 * 60_000).toISOString())
    .gt('sent_at', new Date(now.getTime() - 24 * 3_600_000).toISOString())
    .order('sent_at')
    .limit(1000);
  if (error) throw error;
  const tokenOf = new Map<string, string>();
  const ids: string[] = [];
  for (const row of data) {
    const tt = ((row.data as Record<string, unknown> | null)?.ticket_tokens ?? {}) as Record<string, string>;
    for (const t of row.ticket_ids) {
      ids.push(t);
      if (tt[t]) tokenOf.set(t, tt[t]);
    }
  }
  if (!ids.length) return 0;
  const receipts = await pushSender(env).receipts(ids);
  const rows = Object.entries(receipts).map(([ticket_id, r]) =>
    r.status === 'delivered'
      ? { ticket_id, status: 'delivered' }
      : { ticket_id, status: 'failed', error: r.error, token: tokenOf.get(ticket_id) },
  );
  if (!rows.length) return 0;
  // One device delivered is enough: deliveries first, so another device's failure can't win.
  rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'delivered' ? -1 : 1));
  const { data: n, error: ae } = await db.rpc('apply_push_receipts', { p_rows: rows as unknown as Json });
  if (ae) throw ae;
  return n;
}
