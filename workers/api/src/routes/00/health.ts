import { Hono } from 'hono';
import { requireUser } from '../../auth';
import { serviceDb } from '../../db';
import type { AppEnv } from '../../env';

// Authenticated health check: proves the token, the database and R2 are reachable.
const health = new Hono<AppEnv>();

health.get('/', requireUser, async (c) => {
  const db = serviceDb(c.env);
  const [{ error: dbError }, r2] = await Promise.all([
    db.from('books').select('id', { head: true, count: 'exact' }).limit(1),
    c.env.BOOKS.head('health-probe').then(
      () => true,
      () => false,
    ),
  ]);
  return c.json({
    ok: !dbError && r2,
    env: c.env.APP_ENV,
    user: c.var.user.sub,
    db: dbError ? 'error' : 'ok',
    r2: r2 ? 'ok' : 'error',
  });
});

export default health;
