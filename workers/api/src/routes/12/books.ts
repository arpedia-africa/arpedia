// Author book endpoints (docs/prd/12-book-pipeline.md Server): upload, signed object PUT,
// finalize, confirm chapters, submit, status. Staff fix/release/preview and desk endpoints follow.
import type { Json } from '@arpedia/core';
import { splitParts } from '@arpedia/core';
import { priceChapters } from '@arpedia/convert';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@arpedia/core';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireUser } from '../../auth';
import { serviceDb } from '../../db';
import type { AppEnv } from '../../env';
import { countsPayload, loadWork, runStage, type WorkCopy } from './pipeline';
import { signUpload, verifyUpload } from './tokens';

const MB = 1024 * 1024;
const LIMITS = { docx: 50 * MB, epub: 50 * MB, pdf: 100 * MB, cover: 10 * MB, converted: 50 * MB };
const URL_MINUTES = 15;

/** PostgREST error → HTTP status, from the SQLSTATE the RPC raised. */
const STATUS: Record<string, 400 | 403 | 404 | 409> = {
  '42501': 403,
  '22023': 400,
  '22P02': 400,
  P0002: 404,
  '23505': 409,
  '23514': 409,
  '40001': 409,
};
const rpcError = (c: Context<AppEnv>, e: { code?: string; message: string }) =>
  c.json({ error: e.message }, STATUS[e.code ?? ''] ?? 500);

/** A client that calls RPCs as the signed-in user, so auth.uid() and RLS apply. */
const userDb = (c: Context<AppEnv>) =>
  createClient<Database>(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: c.req.header('Authorization')! }, fetch: (...a) => fetch(...a) },
  });

const books = new Hono<AppEnv>();

// The signed token is the credential here (no JWT), so this route comes before requireUser.
books.put('/objects/:token', async (c) => {
  const claim = await verifyUpload(c.env.UPLOAD_SIGNING_KEY, c.req.param('token'));
  if (!claim) return c.json({ error: 'This upload link has expired. Start the upload again.' }, 403);
  const size = Number(c.req.header('Content-Length') ?? NaN);
  if (!Number.isFinite(size) || size <= 0 || size > claim.max)
    return c.json({ error: 'file_too_large' }, 413);
  const sha256 = c.req.header('X-Content-SHA256')?.toLowerCase();
  if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256)) return c.json({ error: 'sha256 required' }, 400);
  try {
    // R2 checks the body against the declared hash and refuses a mismatch.
    await c.env.BOOKS.put(claim.k, c.req.raw.body, { sha256 });
  } catch {
    return c.json({ error: 'The file did not arrive whole. Please upload it again.' }, 400);
  }
  return c.json({ ok: true });
});

books.use('*', requireUser);

const UploadBody = z.object({
  book_id: z.uuid().optional(),
  meta: z
    .object({
      source_type: z.enum(['docx', 'epub', 'pdf']),
      title: z.string().max(200).optional(),
      subtitle: z.string().max(200).optional(),
      description: z.string().max(5000).optional(),
      genres: z.array(z.string().max(40)).max(5).optional(),
      content_notes: z.array(z.string().max(40)).max(10).optional(),
      age: z.string().max(10).optional(),
      language: z.string().max(10).optional(),
      author_id: z.uuid().optional(),
      rights_confirmed: z.boolean().optional(),
      replace: z.boolean().optional(),
    })
    .strict(),
});

books.post('/upload', async (c) => {
  const body = UploadBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const { data, error } = await userDb(c).rpc('create_revision', {
    p_meta: body.data.meta as Json,
    ...(body.data.book_id ? { p_book: body.data.book_id } : {}),
  });
  if (error) return rpcError(c, error);
  const rev = data as {
    revision_id: string;
    book_id: string;
    source_key: string;
    cover_key: string;
    converted_key: string | null;
  };
  const exp = Math.floor(Date.now() / 1000) + URL_MINUTES * 60;
  const origin = new URL(c.req.url).origin;
  const url = async (k: string, max: number) =>
    `${origin}/v1/books/objects/${await signUpload(c.env.UPLOAD_SIGNING_KEY, { k, max, exp })}`;
  return c.json({
    book_id: rev.book_id,
    revision_id: rev.revision_id,
    expires_at: new Date(exp * 1000).toISOString(),
    uploads: {
      source: await url(rev.source_key, LIMITS[body.data.meta.source_type]),
      cover: await url(rev.cover_key, LIMITS.cover),
      ...(rev.converted_key ? { converted: await url(rev.converted_key, LIMITS.converted) } : {}),
    },
  });
});

const FinalizeBody = z.object({
  revision_id: z.uuid(),
  converted: z.boolean(),
  /** Why the phone did not convert (falls back to the desk). */
  reason: z.enum(['conversion_failed', 'out_of_memory', 'too_large', 'conversion_skipped']).optional(),
});

books.post('/finalize', async (c) => {
  const body = FinalizeBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const db = serviceDb(c.env);
  const { data: rev, error } = await db
    .from('book_revisions')
    .select('id, source_key, converted_key, cover_key')
    .eq('id', body.data.revision_id)
    .single();
  if (error || !rev) return c.json({ error: 'not_found' }, 404);

  // The objects must be there; their hashes come from R2, never from the client.
  const [source, converted, cover] = await Promise.all(
    [rev.source_key, body.data.converted ? rev.converted_key : null, rev.cover_key].map((k) =>
      k ? c.env.BOOKS.head(k) : null,
    ),
  );
  if (!source || (body.data.converted && !converted))
    return c.json({ error: 'Your upload did not finish. Please upload the file again.' }, 409);
  const hex = (o: R2Object | null | undefined) =>
    o?.checksums.sha256
      ? [...new Uint8Array(o.checksums.sha256)].map((b) => b.toString(16).padStart(2, '0')).join('')
      : null;

  const { data, error: fe } = await db.rpc('finalize_revision', {
    p_rev: rev.id,
    p_actor: c.var.user.sub,
    p_files: {
      source_sha256: hex(source),
      converted_sha256: hex(converted),
      cover_sha256: hex(cover),
      file_bytes: source.size,
      converted: body.data.converted,
      reason: body.data.reason ?? null,
    } as Json,
  });
  if (fe) return rpcError(c, fe);
  const res = data as { status: string; generation: number; duplicate?: boolean };
  if (res.status === 'processing' && !res.duplicate)
    c.executionCtx.waitUntil(
      runStage(c.env, { revision_id: rev.id, stage: 'verify', generation: res.generation }),
    );
  return c.json(res);
});

const ConfirmBody = z.object({
  revision_id: z.uuid(),
  edits: z
    .array(
      z.discriminatedUnion('op', [
        z.object({
          op: z.literal('rename'),
          ord: z.number().int().min(0),
          title: z.string().trim().min(1).max(200),
        }),
        z.object({ op: z.literal('merge_up'), ord: z.number().int().min(1) }),
      ]),
    )
    .max(500),
});

/** Renames and merges (Studio step 3), re-splitting anything over 20 pages, then a recount. */
function applyEdits(work: WorkCopy, edits: z.infer<typeof ConfirmBody>['edits']): WorkCopy {
  const ch = work.chapters.map((c) => ({ ...c, blocks: [...c.blocks] }));
  const a = {
    ...work.anchors,
    uids: [...work.anchors.uids],
    ids: work.anchors.ids.map((x) => [...x]),
    fps: work.anchors.fps.map((x) => [...x]),
  };
  for (const e of edits) {
    if (e.ord >= ch.length) throw new RangeError('no such chapter');
    if (e.op === 'rename') Object.assign(ch[e.ord]!, { title: e.title, titled: true });
    else {
      const up = ch[e.ord - 1]!;
      up.blocks.push(...ch[e.ord]!.blocks);
      a.ids[e.ord - 1]!.push(...a.ids[e.ord]!);
      a.fps[e.ord - 1]!.push(...a.fps[e.ord]!);
      ch.splice(e.ord, 1);
      a.uids.splice(e.ord, 1);
      a.ids.splice(e.ord, 1);
      a.fps.splice(e.ord, 1);
    }
  }
  // a merge that passes 20 pages is split again; the first part keeps the chapter's uid
  const out: WorkCopy = { ...work, chapters: [], anchors: { ...a, uids: [], ids: [], fps: [] } };
  ch.forEach((c, i) => {
    const parts = c.front ? null : splitParts([{ title: c.title, paragraphs: c.blocks.map((b) => b.words) }]);
    for (const [k, p] of (
      parts ?? [{ title: c.title, kind: c.kind, start: 0, end: c.blocks.length }]
    ).entries()) {
      out.chapters.push({
        ...c,
        title: p.title,
        kind: parts && parts.length > 1 ? 'part' : c.kind,
        blocks: c.blocks.slice(p.start, p.end),
      });
      out.anchors.uids.push(k === 0 ? a.uids[i]! : crypto.randomUUID());
      out.anchors.ids.push(a.ids[i]!.slice(p.start, p.end));
      out.anchors.fps.push(a.fps[i]!.slice(p.start, p.end));
    }
  });
  // the 10% default target; per-book overrides are flow 03's
  Object.assign(out, priceChapters(out.chapters));
  return out;
}

books.post('/confirm', async (c) => {
  const body = ConfirmBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const db = serviceDb(c.env);
  const { data: rev } = await db
    .from('book_revisions')
    .select('id, status, draft_step, work_version')
    .eq('id', body.data.revision_id)
    .single();
  if (!rev) return c.json({ error: 'not_found' }, 404);
  const work = await loadWork(c.env, rev.id, rev.work_version);
  if (!work || rev.status !== 'draft') return c.json({ error: 'Your chapters are not ready yet.' }, 409);
  let next: WorkCopy;
  try {
    next = applyEdits(work, body.data.edits);
  } catch {
    return c.json({ error: 'invalid_request' }, 400);
  }
  // The author's confirm RPC checks ownership before anything is stored.
  const { data, error } = await db.rpc('confirm_chapters', {
    p_rev: rev.id,
    p_actor: c.var.user.sub,
    p_result: countsPayload(next) as unknown as Json,
  });
  if (error) return rpcError(c, error);
  await c.env.BOOKS.put(`work/${rev.id}/v${rev.work_version}/book.json`, JSON.stringify(next));
  return c.json({ ...(data as object), chapters: countsPayload(next).chapters });
});

books.post('/submit', async (c) => {
  const body = z.object({ revision_id: z.uuid() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const { data, error } = await userDb(c).rpc('submit_revision', { p_rev: body.data.revision_id });
  if (error) return rpcError(c, error);
  const res = data as { status: string; generation: number };
  c.executionCtx.waitUntil(
    runStage(c.env, { revision_id: body.data.revision_id, stage: 'seal', generation: res.generation }),
  );
  return c.json(res);
});

books.get('/status/:id', async (c) => {
  const { data, error } = await userDb(c).rpc('get_revision_status', { p_rev: c.req.param('id') });
  if (error) return rpcError(c, error);
  return c.json(data);
});

export default books;
