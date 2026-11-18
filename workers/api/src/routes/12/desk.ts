// Desk CLI endpoints (docs/prd/12-book-pipeline.md rule 21): claim a job, download its source, get a
// link to upload the converted package, keep the lease alive. The push itself is POST /finalize
// with `converted: true` and the epubcheck flags, the same path as a phone upload.
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { serviceDb } from '../../db';
import type { AppEnv } from '../../env';
import { rpcError, signedUrl } from './http';

const MB = 1024 * 1024;
const desk = new Hono<AppEnv>();
const Body = z.object({ revision_id: z.uuid() });

/** The job, if the caller holds its live lease. */
async function claimed(c: Context<AppEnv>, id: string) {
  const { data } = await serviceDb(c.env)
    .from('book_revisions')
    .select('id, status, source_key, source_type, desk_claimed_by, desk_lease_until')
    .eq('id', id)
    .single();
  const live =
    data?.status === 'with_desk' &&
    data.desk_claimed_by === c.var.user.sub &&
    !!data.desk_lease_until &&
    new Date(data.desk_lease_until).getTime() > Date.now();
  return live ? data : null;
}
const notYours = (c: Context<AppEnv>) => c.json({ error: 'Claim this job first (desk pull).' }, 409);

desk.post('/claim', async (c) => {
  const body = z.object({ revision_id: z.uuid().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const { data, error } = await serviceDb(c.env).rpc('desk_claim', {
    p_rev: body.data.revision_id ?? undefined,
    p_actor: c.var.user.sub,
  });
  if (error) return rpcError(c, error);
  return c.json({ job: data ?? null });
});

desk.post('/source', async (c) => {
  const body = Body.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const job = await claimed(c, body.data.revision_id);
  if (!job?.source_key) return notYours(c);
  const link = await signedUrl(c, job.source_key, { get: true });
  return c.json({ url: `${link.url}source.${job.source_type}`, expires_at: link.expires_at });
});

desk.post('/upload', async (c) => {
  const body = Body.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const job = await claimed(c, body.data.revision_id);
  if (!job) return notYours(c);
  return c.json(await signedUrl(c, `src/${job.id}/converted.epub`, { max: 50 * MB }));
});

desk.post('/heartbeat', async (c) => {
  const body = Body.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const { data, error } = await serviceDb(c.env).rpc('desk_heartbeat', {
    p_rev: body.data.revision_id,
    p_actor: c.var.user.sub,
  });
  if (error) return rpcError(c, error);
  return c.json({ lease_until: data });
});

export default desk;
