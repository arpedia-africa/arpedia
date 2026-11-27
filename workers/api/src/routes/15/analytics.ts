// Flow 15 · server events to PostHog (spec check 15-26, with 11-13, 13-20, 14-29). Postgres
// collects staff and system events in analytics_outbox (an audit_log trigger and two table
// triggers); this sends them to PostHog's batch endpoint every minute. Without POSTHOG_KEY nothing
// is sent and the outbox purges itself after 7 days.
import type { Env } from '../../env';
import { serviceDb } from '../../db';

export interface OutboxRow {
  id: number;
  event: string;
  distinct_id: string;
  props: Record<string, unknown>;
  at: string;
}

const DEFAULT_HOST = 'https://eu.i.posthog.com';
const BATCH = 200;

/** PostHog's /batch/ body for some outbox rows. */
export function posthogBatch(key: string, rows: OutboxRow[], appEnv: string) {
  return {
    api_key: key,
    historical_migration: false,
    batch: rows.map((r) => ({
      event: r.event,
      distinct_id: r.distinct_id,
      timestamp: r.at,
      properties: { ...r.props, app_env: appEnv, $lib: 'arpedia-api', outbox_id: r.id },
    })),
  };
}

/** One minute's sending; returns how many events went out. */
export async function flushAnalytics(env: Env, fetcher: typeof fetch = fetch): Promise<number> {
  const db = serviceDb(env);
  const { data, error } = await db.rpc('analytics_outbox_take', { p_limit: BATCH });
  if (error) throw error;
  const rows = (data ?? []) as unknown as OutboxRow[];
  if (!env.POSTHOG_KEY || rows.length === 0) return 0;
  const host = (env.POSTHOG_HOST || DEFAULT_HOST).replace(/\/+$/, '');
  if (!host.startsWith('https://')) return 0;
  const res = await fetcher(`${host}/batch/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(posthogBatch(env.POSTHOG_KEY, rows, env.APP_ENV)),
  });
  // Not marked sent: the next minute tries again (the outbox keeps them up to 7 days).
  if (!res.ok) throw new Error(`posthog batch ${res.status}`);
  const { error: dErr } = await db.rpc('analytics_outbox_done', { p_ids: rows.map((r) => r.id) });
  if (dErr) throw dErr;
  return rows.length;
}
