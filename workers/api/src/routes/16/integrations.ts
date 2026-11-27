import { Hono } from 'hono';
import { requireUser } from '../../auth';
import { serviceDb } from '../../db';
import type { AppEnv, Env } from '../../env';
import { userDb } from '../12/http';

// Flow 16 rule 39: health checks every minute (the api Worker's cron). Only what can be measured
// without calling a provider with a secret: the database, R2, payment webhooks as received, and
// (16-6) Google Play and App Store webhooks, payout transfers, push receipts and email sends.
// A service with no event yet, and expo_updates (nothing to measure), keeps its last status (Q6).

type Status = 'working' | 'degraded' | 'failing';

interface WebhookHealth {
  last_at: string | null;
  last_type: string | null;
  total: number;
  failed: number;
}

/** Share of failed events → status: over 10% failing, over 2% degraded. */
export function statusFor(total: number, failed: number): { status: Status; rate: number } {
  const rate = total > 0 ? (failed / total) * 100 : 0;
  return {
    status: rate > 10 ? 'failing' : rate > 2 ? 'degraded' : 'working',
    rate: Math.round(rate * 1000) / 1000,
  };
}

/** Services measured from Arpedia's own records (worker_service_health). */
const SERVICES = ['google_play', 'app_store', 'flutterwave_transfers', 'fcm', 'resend'] as const;

const label = (t: string | null) => (t ? t.replace(/[_.]/g, ' ').toLowerCase() : null);

export async function checkIntegrations(env: Env): Promise<number> {
  const db = serviceDb(env);
  const set = (
    service: string,
    status: Status,
    lastAt: string | null,
    text: string | null,
    rate: number | null,
    note?: string,
  ) =>
    db.rpc('worker_set_integration_health', {
      p_service: service,
      p_status: status,
      p_last_event_at: lastAt ?? undefined,
      p_last_event_text: text ?? undefined,
      p_error_rate: rate ?? undefined,
      p_error_note: note,
    });

  const started = Date.now();
  const [pay, svc, r2] = await Promise.all([
    db.rpc('worker_payment_health'),
    db.rpc('worker_service_health'),
    env.BOOKS.head('health-probe').then(
      () => true,
      () => false,
    ),
  ]);
  const now = new Date().toISOString();
  const jobs: PromiseLike<unknown>[] = [];
  // The RPC itself is the database probe.
  jobs.push(
    set(
      'supabase',
      pay.error ? 'failing' : 'working',
      now,
      pay.error ? 'health check failed' : `health check ${Date.now() - started} ms`,
      null,
    ),
  );
  jobs.push(
    set('r2', r2 ? 'working' : 'failing', now, r2 ? 'bucket reachable' : 'bucket not reachable', null),
  );
  if (!pay.error && pay.data) {
    const hooks = pay.data as unknown as Record<string, WebhookHealth>;
    for (const [provider, service] of [
      ['revenuecat', 'revenuecat'],
      ['flutterwave', 'flutterwave_checkout'],
    ] as const) {
      const h = hooks[provider];
      if (!h) continue;
      const { status, rate } = statusFor(h.total, h.failed);
      jobs.push(
        set(
          service,
          status,
          h.last_at,
          label(h.last_type),
          rate,
          h.failed ? `${h.failed} of ${h.total} events failed` : undefined,
        ),
      );
    }
  }
  if (svc.error) console.error('worker_service_health', svc.error.message);
  else if (svc.data) {
    const services = svc.data as unknown as Record<string, WebhookHealth | null>;
    for (const service of SERVICES) {
      const h = services[service];
      if (!h || (!h.last_at && !h.total)) continue;
      const { status, rate } = statusFor(h.total, h.failed);
      jobs.push(
        set(
          service,
          status,
          h.last_at,
          label(h.last_type),
          rate,
          h.failed ? `${h.failed} of ${h.total} failed in 24 hours` : undefined,
        ),
      );
    }
  }
  const results = await Promise.all(jobs);
  let failed = 0;
  for (const r of results as { error: unknown }[])
    if (r.error) {
      failed++;
      console.error('integration health', r.error);
    }
  // How many statuses could not be saved (the cron ignores it; "Check all now" reports it).
  return failed;
}

// POST /v1/integrations/check: "Check all now" (rule 39) runs the checks at once. The staff
// member's own token calls request_integration_check, which needs manage_settings and records who
// asked; only then does the Worker run the same checks as the cron.
const integrations = new Hono<AppEnv>();

integrations.post('/check', requireUser, async (c) => {
  const { error } = await userDb(c).rpc('request_integration_check');
  if (error) {
    if (error.code === '42501') return c.json({ error: 'not_allowed' }, 403);
    console.error('request_integration_check', error.message);
    return c.json({ error: 'check_failed' }, 500);
  }
  if ((await checkIntegrations(c.env)) > 0) return c.json({ error: 'check_failed' }, 500);
  return c.json({ ok: true });
});

export default integrations;
