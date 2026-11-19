// Flow 15 · campaign-runner (Server). Every minute: claim due campaigns (scheduled → sending by
// compare and set, so a double run can't send twice), resolve the audience at send time, log the
// readers left out by the marketing cap, and enqueue the rest to push_fanout in chunks of 1,000.
// A/B title test: 20% get the test (half A, half B), the winner goes to everyone else 2 hours later.
import { type Json, CAMPAIGN_CHUNK, abBucket, abWinner, chunks } from '@arpedia/core';
import { serviceDb } from '../../db';
import type { Env } from '../../env';
import type { FanoutData } from './dispatcher';

type Db = ReturnType<typeof serviceDb>;
type Campaign = Awaited<ReturnType<typeof claim>>[number];
interface AbTest {
  title_b?: string;
  phase?: 'testing';
  winner?: 'a' | 'b';
}

async function claim(db: Db) {
  const { data, error } = await db.rpc('claim_due_campaigns', { p_limit: 5 });
  if (error) throw error;
  return data;
}

/** Every reader in the audience with the reason they are left out (paged past max_rows). */
async function audience(db: Db, id: string) {
  const rows: { user_id: string; reason: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.rpc('campaign_audience', { p_campaign: id }).range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function enqueue(db: Db, c: Campaign, users: string[], variant: 'a' | 'b' | undefined) {
  const ab = (c.ab_test ?? {}) as AbTest;
  const target = c.open_target as FanoutData['target'];
  const data: FanoutData = {
    campaign_id: c.id,
    variant,
    title: variant === 'b' && ab.title_b ? ab.title_b : c.title,
    body: c.body,
    target,
    is_service: c.is_service,
    skip_capped: c.skip_capped,
    respect_quiet: c.respect_quiet,
  };
  for (const ids of chunks(users, CAMPAIGN_CHUNK)) {
    const { error } = await db.rpc('enqueue_push', {
      p_type: 'campaign',
      p_user_ids: ids,
      p_data: data as Json,
    });
    if (error) throw error;
  }
}

async function logCapped(db: Db, c: Campaign, users: string[]) {
  for (const ids of chunks(users, 500)) {
    const rows = ids.map((u) => ({
      user_id: u,
      type: 'campaign',
      campaign_id: c.id,
      status: 'skipped_cap',
      skip_reason: 'cap',
    }));
    const { error } = await db.rpc('log_pushes', { p_rows: rows as unknown as Json });
    if (error) throw error;
  }
}

export async function runCampaign(db: Db, c: Campaign): Promise<void> {
  const ab = (c.ab_test ?? {}) as AbTest;
  const prev = (c.counts ?? {}) as Record<string, number>;
  const rows = await audience(db, c.id);
  const gets = rows.filter((r) => r.reason === null).map((r) => r.user_id);
  const capped = rows.filter((r) => r.reason === 'cap').map((r) => r.user_id);
  await logCapped(db, c, capped);
  const skipped_cap = (prev.skipped_cap ?? 0) + capped.length;

  if (ab.title_b && !ab.phase && !ab.winner) {
    const a = gets.filter((u) => abBucket(u) === 'a');
    const b = gets.filter((u) => abBucket(u) === 'b');
    await enqueue(db, c, a, 'a');
    await enqueue(db, c, b, 'b');
    const { error } = await db.rpc('campaign_ab_wait', {
      p_id: c.id,
      p_ab: { phase: 'testing', tested_at: new Date().toISOString() },
      p_counts: { queued: (prev.queued ?? 0) + a.length + b.length, skipped_cap },
    });
    if (error) throw error;
    return;
  }

  let variant: 'a' | 'b' | undefined;
  if (ab.title_b) {
    const { data: stats, error } = await db.rpc('campaign_variant_stats', { p_id: c.id });
    if (error) throw error;
    const s = stats as unknown as Record<'a' | 'b', { sent: number; opened: number }>;
    variant = ab.winner ?? abWinner(s.a, s.b);
    const { error: we } = await db.rpc('campaign_set_ab', {
      p_id: c.id,
      p_ab: { winner: variant, decided_at: new Date().toISOString() },
    });
    if (we) throw we;
  }
  await enqueue(db, c, gets, variant);
  const { error } = await db.rpc('finish_campaign', {
    p_id: c.id,
    p_counts: { queued: (prev.queued ?? 0) + gets.length, skipped_cap },
  });
  if (error) throw error;
}

export async function runCampaigns(env: Env): Promise<void> {
  const db = serviceDb(env);
  for (const c of await claim(db)) {
    try {
      await runCampaign(db, c);
    } catch (e) {
      // Left in `sending`: staff see it stuck and the console offers Retry (states: Error).
      console.error('campaign failed', c.id, e);
    }
  }
}
