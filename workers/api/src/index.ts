import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv, Env } from './env';
import { routes } from './routes';
import { indexSearchText } from './routes/02/search-text';
import { erasePending } from './routes/10/account';
import { drainPayments } from './routes/09/payments';
import { isReconcileTime, storeReconcile } from './routes/09/reconcile';
import { consumeApplicationChecks } from './routes/11/applications';
import { consumeQueue } from './routes/12/pipeline';
import { checkIntegrations } from './routes/16/integrations';
import { drainPayouts, payoutReminder, pollPendingPayouts } from './routes/13/earnings';
import { statementsAfterRelease } from './routes/13/statements';
import { engageCron } from './routes/15/engage';
import { drainNotify } from './routes/15/notify';
import { checkClaimSimilarity } from './routes/14/claims';
import { drainTrustOutbox } from './routes/14/trust';
import { flushAnalytics } from './routes/15/analytics';

const app = new Hono<AppEnv>();

// X-Content-SHA256: the admin console uploads files from the browser straight to signed object URLs.
app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Content-SHA256'],
  }),
);

// Public liveness probe (no auth, no dependencies).
app.get('/health', (c) => c.json({ ok: true, service: 'api', env: c.env.APP_ENV }));

for (const [path, router] of routes) app.route(path, router);

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal' }, 500);
});

export default {
  fetch: app.fetch,
  // Every minute: the book pipeline's safety net (flow 12), application checks (flow 11), the story
  // search index (flow 02), due account erasures (flow 10), outbound payment calls (flow 09),
  // author payouts (flow 13), integration health checks (flow 16) and pushes, campaigns and exports
  // (flow 15), notices from every flow and the trust outbox (flow 15 dispatcher, flow 14), the copyright claims passage check (flow 14) and server analytics (flow 15); on the
  // hour, payouts pending over 48 hours; every 10 minutes, statements for released months; daily,
  // the payout-day reminder to Finance (flow 13); weekly (Monday 03:00 in Lagos), store_reconcile (flow 09).
  scheduled: (event, env, ctx) =>
    ctx.waitUntil(
      Promise.allSettled([
        consumeQueue(env),
        consumeApplicationChecks(env),
        indexSearchText(env),
        erasePending(env),
        drainPayments(env),
        drainPayouts(env),
        checkIntegrations(env),
        engageCron(env, event.scheduledTime),
        drainNotify(env),
        drainTrustOutbox(env),
        checkClaimSimilarity(env),
        flushAnalytics(env),
        ...(new Date(event.scheduledTime).getUTCMinutes() === 0 ? [pollPendingPayouts(env)] : []),
        ...(new Date(event.scheduledTime).getUTCMinutes() % 10 === 5 ? [statementsAfterRelease(env)] : []),
        // 09:00 in Lagos (UTC+1); a missed day still falls inside the 3-day window.
        ...(new Date(event.scheduledTime).getUTCMinutes() === 0 &&
        new Date(event.scheduledTime).getUTCHours() === 8
          ? [payoutReminder(env)]
          : []),
        ...(isReconcileTime(event.scheduledTime) ? [storeReconcile(env, event.scheduledTime)] : []),
      ]),
    ),
} satisfies ExportedHandler<Env>;
