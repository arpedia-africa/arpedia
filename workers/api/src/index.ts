import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './env';
import { routes } from './routes';

const app = new Hono<AppEnv>();

app.use('*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'] }));

// Public liveness probe (no auth, no dependencies).
app.get('/health', (c) => c.json({ ok: true, service: 'api', env: c.env.APP_ENV }));

for (const [path, router] of routes) app.route(path, router);

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal' }, 500);
});

export default app;
