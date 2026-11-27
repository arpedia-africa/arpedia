// Staff Edit details and Replace cover (spec check 03-16; flow 03 admin rule 1, flow 12 rule 41).
// `staff_revise_book` copies the live revision into a staff draft that keeps the live sealed files.
// This Worker then copies the working copy (for the review preview and staff fixes), checks a new
// cover, and `complete_staff_revision` routes the revision to review. Readers keep the live
// revision until another publisher publishes it.
//   POST /v1/books/staff-edit        {book_id, meta, cover, note} → {revision_id, status} or a cover upload URL
//   POST /v1/books/staff-edit/finish {revision_id}                → {revision_id, status} (after the cover PUT)
import type { Json } from '@arpedia/core';
import { imageSize, imageType } from '@arpedia/convert';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { serviceDb } from '../../db';
import type { AppEnv, Env } from '../../env';
import { rpcError, signedUrl, userDb } from './http';
import { loadWork, workPrefix } from './pipeline';

const COVER_MAX = 10 * 1024 * 1024;

const edit = new Hono<AppEnv>();

const Meta = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    subtitle: z.string().max(200).optional(),
    description: z.string().max(5000).optional(),
    genres: z.array(z.string().max(40)).max(5).optional(),
    content_notes: z.array(z.string().max(40)).max(10).optional(),
    age: z.string().max(10).optional(),
    language: z.string().max(10).optional(),
  })
  .strict();

const StartBody = z.object({
  book_id: z.guid(),
  meta: Meta.default({}),
  cover: z.boolean().default(false),
  note: z.string().trim().max(500).optional(),
});

/** The cover checks of rule 24 (size and shape), from the image's own bytes. */
export function coverFlags(bytes: Uint8Array): { check_key: string; message: string }[] | null {
  const kind = imageType(bytes);
  if (kind !== 'jpeg' && kind !== 'png') return null;
  const size = imageSize(bytes);
  const flags: { check_key: string; message: string }[] = [];
  if (size && size.width < 800)
    flags.push({
      check_key: 'cover_too_small',
      message: `The cover is ${size.width} px wide; 800 px or more looks sharp.`,
    });
  if (size && size.height > 0 && (size.width / size.height < 0.55 || size.width / size.height > 0.7))
    flags.push({
      check_key: 'cover_aspect',
      message: 'The cover is not the usual book shape (about 2 : 3).',
    });
  return flags;
}

/** Copy every object under one prefix to another (R2 has no server-side copy in a binding). */
async function copyPrefix(env: Env, from: string, to: string) {
  let cursor: string | undefined;
  do {
    const page = await env.BOOKS.list({ prefix: from, cursor });
    await Promise.all(
      page.objects.map(async (o) => {
        const obj = await env.BOOKS.get(o.key);
        if (obj)
          await env.BOOKS.put(to + o.key.slice(from.length), obj.body, { httpMetadata: obj.httpMetadata });
      }),
    );
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

/**
 * The live revision's working copy, under the new revision's id, so Quick review and staff fixes
 * work on it as on any revision. A book without one (imported before the pipeline) still goes to
 * review; its preview then says it is not ready.
 */
export async function copyWork(env: Env, base: string, rev: string, version: number) {
  const work = await loadWork(env, base, version);
  if (!work) {
    console.warn('[staff-edit] no working copy for', base, version);
    return false;
  }
  await copyPrefix(env, workPrefix(base, version), workPrefix(rev, version));
  const images = work.imagesFrom;
  if (images !== undefined && images !== version)
    await copyPrefix(env, workPrefix(base, images), workPrefix(rev, images));
  return true;
}

const hex = (o: R2Object) =>
  o.checksums.sha256
    ? [...new Uint8Array(o.checksums.sha256)].map((b) => b.toString(16).padStart(2, '0')).join('')
    : null;

/** Copy the working copy, check the cover if there is a new one, and route to review. */
async function finish(c: Context<AppEnv>, revId: string) {
  const db = serviceDb(c.env);
  const { data: rev, error } = await db
    .from('book_revisions')
    .select('id, status, staff_edit, uploaded_by, base_revision_id, work_version, cover_key')
    .eq('id', revId)
    .maybeSingle();
  if (error) return rpcError(c, error);
  if (!rev?.staff_edit || rev.uploaded_by !== c.var.user.sub) return c.json({ error: 'not_found' }, 404);
  if (rev.status !== 'draft') return c.json({ revision_id: rev.id, status: rev.status, duplicate: true });

  let cover: { sha256: string; flags: { check_key: string; message: string }[] } | null = null;
  if ((rev.staff_edit as { cover?: boolean }).cover) {
    const obj = rev.cover_key ? await c.env.BOOKS.get(rev.cover_key) : null;
    if (!obj) return c.json({ error: 'The new cover did not arrive. Choose it again.' }, 409);
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const flags = bytes.byteLength <= COVER_MAX ? coverFlags(bytes) : null;
    const sha256 = hex(obj);
    if (!flags || !sha256) {
      await c.env.BOOKS.delete(rev.cover_key!);
      return c.json({ error: 'Choose a JPG or PNG cover, up to 10 MB.' }, 400);
    }
    cover = { sha256, flags };
  }

  if (rev.base_revision_id) await copyWork(c.env, rev.base_revision_id, rev.id, rev.work_version);
  const done = await db.rpc('complete_staff_revision', {
    p_rev: rev.id,
    p_actor: c.var.user.sub,
    ...(cover ? { p_cover: cover as unknown as Json } : {}),
  });
  if (done.error) return rpcError(c, done.error);
  return c.json(done.data as { revision_id: string; status: string });
}

edit.post('/', async (c) => {
  const body = StartBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const { data, error } = await userDb(c).rpc('staff_revise_book', {
    p_book: body.data.book_id,
    p_meta: body.data.meta as Json,
    p_cover: body.data.cover,
    ...(body.data.note ? { p_note: body.data.note } : {}),
  });
  if (error) return rpcError(c, error);
  const rev = data as { revision_id: string; revision_no: number; cover_key: string | null };
  if (!rev.cover_key) return finish(c, rev.revision_id);
  const upload = await signedUrl(c, rev.cover_key, { max: COVER_MAX });
  return c.json({
    revision_id: rev.revision_id,
    revision_no: rev.revision_no,
    status: 'draft',
    upload: upload.url,
    expires_at: upload.expires_at,
  });
});

edit.post('/finish', async (c) => {
  const body = z.object({ revision_id: z.guid() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  return finish(c, body.data.revision_id);
});

export default edit;
