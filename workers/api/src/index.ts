import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv, Env } from './env';
import { routes } from './routes';
import { consumeQueue } from './routes/12/pipeline';
import { engageCron } from './routes/15/engage';

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
  // Every minute: the book pipeline's safety net (flow 12); pushes, campaigns, exports (flow 15).
  scheduled: (event, env, ctx) => {
    ctx.waitUntil(consumeQueue(env));
    ctx.waitUntil(engageCron(env, event.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
