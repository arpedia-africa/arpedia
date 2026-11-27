// Staff Edit details and Replace cover (spec check 03-16; flow 03 admin rule 1, flow 12 rule 41).
// The new revision reuses the live revision's sealed files. This Worker picks its id, copies the
// working copy under it (for the review preview and staff fixes) and checks a new cover, then
// `staff_revise_book` creates the revision and routes it to review in one transaction, so an
// abandoned edit leaves no row behind. Readers keep the live revision until another Publisher
// publishes it.
//   POST /v1/books/staff-edit/cover {book_id}                    → {cover_token, upload} (PUT the cover there)
//   POST /v1/books/staff-edit {book_id, meta, note, cover_token?} → {revision_id, revision_no, status}
import type { Json } from '@arpedia/core';
import { imageSize, imageType } from '@arpedia/convert';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { serviceDb } from '../../db';
import type { AppEnv, Env } from '../../env';
import { rpcError, signedUrl } from './http';
import { loadWork, workPrefix } from './pipeline';
import { isPublisher } from './staff';
import { verifyUpload } from './tokens';

const COVER_MAX = 10 * 1024 * 1024;
/** R2 calls in flight at once while copying (Workers cap simultaneous connections per request). */
const COPY_BATCH = 6;
const OPEN = ['draft', 'processing', 'with_desk', 'needs_fixes', 'ready_for_review', 'scheduled'] as const;

const edit = new Hono<AppEnv>();
type Db = ReturnType<typeof serviceDb>;

const Meta = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    subtitle: z.string().max(200).optional(),
    description: z.string().max(5000).optional(),
    genres: z.array(z.string().max(40)).min(1).max(5).optional(),
    content_notes: z.array(z.string().max(40)).max(10).optional(),
    age: z.string().max(10).optional(),
    language: z.string().max(10).optional(),
  })
  .strict();

const SaveBody = z.object({
  book_id: z.guid(),
  meta: Meta.default({}),
  note: z.string().trim().max(500).optional(),
  /** From POST /cover: the signed upload token; the cover is at its key, src/{id}/cover. */
  cover_token: z.string().max(1000).optional(),
});

type Flag = { check_key: string; message: string };

/** The cover checks of rule 24 (size and shape), from the image's own bytes; null if not a JPG or PNG. */
export function coverFlags(bytes: Uint8Array): Flag[] | null {
  const kind = imageType(bytes);
  if (kind !== 'jpeg' && kind !== 'png') return null;
  const size = imageSize(bytes);
  const flags: Flag[] = [];
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

/** Copy every object under one prefix to another, a few at a time (no server-side copy in a binding). */
async function copyPrefix(env: Env, from: string, to: string) {
  let cursor: string | undefined;
  do {
    const page = await env.BOOKS.list({ prefix: from, cursor });
    for (let i = 0; i < page.objects.length; i += COPY_BATCH)
      await Promise.all(
        page.objects.slice(i, i + COPY_BATCH).map(async (o) => {
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

/**
 * The live revision to copy, or why the database would refuse (it checks again), so a refused edit
 * copies nothing.
 */
async function liveBase(c: Context<AppEnv>, db: Db, bookId: string) {
  if (!(await isPublisher(db, c.var.user.sub)))
    return { error: c.json({ error: 'Only Publishers can do this.' }, 403) };
  const { data: book, error } = await db
    .from('books')
    .select('status, current_revision_id')
    .eq('id', bookId)
    .maybeSingle();
  if (error) return { error: rpcError(c, error) };
  if (!book) return { error: c.json({ error: 'book not found' }, 404) };
  if (book.status !== 'live' || !book.current_revision_id)
    return { error: c.json({ error: 'only a live book can be edited here' }, 409) };
  const { count } = await db
    .from('book_revisions')
    .select('id', { count: 'exact', head: true })
    .eq('book_id', bookId)
    .in('status', [...OPEN]);
  if (count) return { error: c.json({ error: 'another revision of this book is open' }, 409) };
  const { data: base, error: be } = await db
    .from('book_revisions')
    .select('id, work_version, sealed_work_version')
    .eq('id', book.current_revision_id)
    .single();
  if (be || !base) return { error: c.json({ error: 'book not found' }, 404) };
  return { base };
}

edit.post('/cover', async (c) => {
  const body = z.object({ book_id: z.guid() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const r = await liveBase(c, serviceDb(c.env), body.data.book_id);
  if (r.error) return r.error;
  const upload = await signedUrl(c, `src/${crypto.randomUUID()}/cover`, { max: COVER_MAX });
  return c.json({
    cover_token: upload.url.split('/').pop()!,
    upload: upload.url,
    expires_at: upload.expires_at,
  });
});

edit.post('/', async (c) => {
  const body = SaveBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const db = serviceDb(c.env);
  const r = await liveBase(c, db, body.data.book_id);
  if (r.error) return r.error;
  // The revision takes the id the Worker put in the cover's upload token, so no client-chosen id
  // ever names R2 keys; one that is already a revision (a repeat) is refused before any copy.
  let id: string = crypto.randomUUID();
  if (body.data.cover_token) {
    const claim = await verifyUpload(c.env.UPLOAD_SIGNING_KEY, body.data.cover_token);
    const m = !claim?.use && claim?.k.match(/^src\/([0-9a-f-]{36})\/cover$/);
    if (!m) return c.json({ error: 'The cover upload expired. Choose the cover again.' }, 409);
    id = m[1]!;
    const { count } = await db
      .from('book_revisions')
      .select('id', { count: 'exact', head: true })
      .eq('id', id);
    if (count) return c.json({ error: 'This cover was already saved.' }, 409);
  }

  let cover: { sha256: string; flags: Flag[] } | null = null;
  if (body.data.cover_token) {
    const key = `src/${id}/cover`;
    const obj = await c.env.BOOKS.get(key);
    if (!obj) return c.json({ error: 'The new cover did not arrive. Choose it again.' }, 409);
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const flags = bytes.byteLength <= COVER_MAX ? coverFlags(bytes) : null;
    const sha256 = hex(obj);
    if (!flags || !sha256) {
      await c.env.BOOKS.delete(key);
      return c.json({ error: 'Choose a JPG or PNG cover, up to 10 MB.' }, 400);
    }
    cover = { sha256, flags };
  }

  await copyWork(c.env, r.base.id, id, r.base.sealed_work_version ?? r.base.work_version);
  const { data, error } = await db.rpc('staff_revise_book', {
    p_rev: id,
    p_book: body.data.book_id,
    p_meta: body.data.meta as Json,
    p_actor: c.var.user.sub,
    ...(cover ? { p_cover: cover as unknown as Json } : {}),
    ...(body.data.note ? { p_note: body.data.note } : {}),
  });
  if (error) return rpcError(c, error);
  return c.json(data as { revision_id: string; revision_no: number; status: string });
});

export default edit;
