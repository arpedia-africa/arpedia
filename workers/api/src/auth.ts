import { AuthError, bearer, verifySupabaseJwt } from '@arpedia/core/jwt';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from './env';

/** Rejects requests without a valid Supabase access token; puts the claims on `c.var.user`. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'unauthorized' }, 401);
  try {
    const user = await verifySupabaseJwt(token, {
      supabaseUrl: c.env.SUPABASE_URL,
      hsSecret: c.env.APP_ENV === 'local' ? c.env.SUPABASE_JWT_SECRET : undefined,
    });
    c.set('user', user);
  } catch (e) {
    if (e instanceof AuthError) return c.json({ error: 'unauthorized' }, 401);
    throw e;
  }
  await next();
});
