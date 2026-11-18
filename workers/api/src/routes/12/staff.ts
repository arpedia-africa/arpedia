// Staff book endpoints (docs/prd/12-book-pipeline.md rules 19, 29–32): fix operations with Undo,
// the rescore of touched chapters, Mark fixed and send to review (reseal first), and the signed
// preview of the working copy (also for the revision's author).
import type { Json } from '@arpedia/core';
import { type FixOp, FixError, TEXT_CHECKS, applyFix, checkChapters, copyrightText } from '@arpedia/convert';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { serviceDb } from '../../db';
import type { AppEnv } from '../../env';
import { rpcError, signedUrl, userDb } from './http';
import {
  countsPayload,
  loadWork,
  locateFlags,
  revision,
  saveWork,
  sealStage,
  type WorkCopy,
} from './pipeline';

const staff = new Hono<AppEnv>();
type Db = ReturnType<typeof serviceDb>;

/** Publisher (or Super admin): the RPCs check again; this only saves work for everyone else. */
async function isPublisher(db: Db, uid: string) {
  const { data } = await db
    .from('staff_roles')
    .select('role')
    .eq('user_id', uid)
    .eq('active', true)
    .in('role', ['publisher', 'super_admin']);
  return (data ?? []).length > 0;
}

const notStaff = (c: Context<AppEnv>) => c.json({ error: 'Only Publishers can do this.' }, 403);

/**
 * Re-run the text checks and store the new counts (rule 31). Replaced: the touched chapters' flags
 * and book-level ones (too short, no copyright page). Flags on other chapters, and flags staff
 * dismissed, are left as they are.
 */
async function rescore(db: Db, revId: string, version: number, work: WorkCopy, touched: string[]) {
  const all = locateFlags(checkChapters(work.chapters, { untitledBook: work.untitledBook }), work.anchors);
  const flags = all.filter((f) => !f.location.chapter_uid || touched.includes(f.location.chapter_uid));
  const { data, error } = await db.rpc('complete_rescore', {
    p_rev: revId,
    p_work_version: version,
    p_chapter_uids: touched,
    p_flags: flags as unknown as Json,
    p_result: countsPayload(work) as unknown as Json,
    p_check_keys: TEXT_CHECKS,
  });
  if (error) throw error;
  return data as { applied: boolean; readiness?: number; blocking?: boolean };
}

const Op = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('rename_chapter'),
    chapter_uid: z.uuid(),
    title: z.string().trim().min(1).max(200),
  }),
  z.object({ op: z.literal('set_heading'), chapter_uid: z.uuid(), para_id: z.string().max(40) }),
  z.object({ op: z.literal('merge_chapter_up'), chapter_uid: z.uuid() }),
  z.object({ op: z.literal('remove_paragraph'), chapter_uid: z.uuid(), para_id: z.string().max(40) }),
  z.object({ op: z.literal('insert_copyright_page') }),
  z.object({ op: z.literal('dismiss_flag'), reason: z.string().trim().min(1).max(500) }),
  z.object({ op: z.literal('shrink_image'), image: z.string().max(200) }),
]);
const FixBody = z
  .object({
    revision_id: z.uuid(),
    /** The flag being fixed; without `op` its suggested fix is applied (Accept suggestion). */
    flag_id: z.uuid().optional(),
    op: Op.optional(),
    /** The working-copy version the screen showed, so two staff never overwrite each other. */
    expected_version: z.number().int().min(0),
  })
  .refine((b) => b.flag_id || b.op);

staff.post('/fix', async (c) => {
  const body = FixBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const db = serviceDb(c.env);
  const actor = c.var.user.sub;
  if (!(await isPublisher(db, actor))) return notStaff(c);
  const rev = await revision(db, body.data.revision_id).catch(() => null);
  if (!rev) return c.json({ error: 'not_found' }, 404);
  if (rev.status !== 'needs_fixes') return c.json({ error: 'This book is not in Needs fixes.' }, 409);
  if (rev.work_version !== body.data.expected_version)
    return c.json({ error: 'Someone else changed this book. Reload to see their changes.' }, 409);

  let parsed = body.data.op;
  if (body.data.flag_id) {
    const { data: flag } = await db
      .from('book_flags')
      .select('fix_op, status')
      .eq('id', body.data.flag_id)
      .eq('revision_id', rev.id)
      .single();
    if (!flag || flag.status !== 'open') return c.json({ error: 'That flag is already closed.' }, 409);
    if (!parsed) {
      const suggested = Op.safeParse(flag.fix_op);
      if (!suggested.success) return c.json({ error: 'This flag has no suggested fix.' }, 400);
      parsed = suggested.data;
    }
  }
  let op: FixOp;
  if (parsed!.op === 'insert_copyright_page') {
    const { data: book } = await db
      .from('books')
      .select('profiles!books_author_id_fkey(full_name)')
      .eq('id', rev.book_id)
      .single();
    const author = (book?.profiles as { full_name: string | null } | null)?.full_name ?? 'The author';
    op = { op: 'insert_copyright_page', text: copyrightText(author, new Date().getUTCFullYear()) };
  } else op = parsed!;

  const work = await loadWork(c.env, rev.id, rev.work_version);
  if (!work) return c.json({ error: 'The working copy is missing. Send the book to the desk.' }, 409);
  let result;
  try {
    result = await applyFix(work, op);
  } catch (e) {
    if (e instanceof FixError) return c.json({ error: e.message }, 409);
    throw e;
  }

  // The next version's file is written before the RPC takes the version lock, so the database never
  // points at a missing file. The winner writes it again afterwards: if two staff raced, the loser's
  // copy may have landed first.
  const nextWork: WorkCopy = { ...result.work, imagesFrom: work.imagesFrom ?? rev.work_version };
  await saveWork(c.env, rev.id, rev.work_version + 1, nextWork, {});
  const { data: fix, error } = await db.rpc('record_fix', {
    p_rev: rev.id,
    // null when the op is not for a flag (generated types do not mark SQL args nullable)
    p_flag: (body.data.flag_id ?? null) as string,
    p_op: op as unknown as Json,
    p_inverse: { restore_version: rev.work_version } as Json,
    p_expected_version: rev.work_version,
    p_actor: actor,
  });
  if (error) return rpcError(c, error);
  const rec = fix as { fix_id: string; work_version: number; readiness: number; blocking: boolean };
  await saveWork(c.env, rev.id, rec.work_version, nextWork, {});
  const scored = result.restructured
    ? await rescore(db, rev.id, rec.work_version, result.work, result.touched)
    : rec;
  return c.json({
    fix_id: rec.fix_id,
    work_version: rec.work_version,
    readiness: scored.readiness ?? rec.readiness,
    blocking: scored.blocking ?? rec.blocking,
  });
});

const UndoBody = z.object({ fix_id: z.uuid(), expected_version: z.number().int().min(0) });

staff.post('/fix/undo', async (c) => {
  const body = UndoBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const db = serviceDb(c.env);
  const actor = c.var.user.sub;
  if (!(await isPublisher(db, actor))) return notStaff(c);
  const { data: fix } = await db
    .from('book_fixes')
    .select('revision_id, inverse')
    .eq('id', body.data.fix_id)
    .single();
  if (!fix) return c.json({ error: 'not_found' }, 404);
  const from = (fix.inverse as { restore_version?: number } | null)?.restore_version;
  const [restored, current] = await Promise.all([
    from === undefined ? null : loadWork(c.env, fix.revision_id, from),
    loadWork(c.env, fix.revision_id, body.data.expected_version),
  ]);
  if (!restored || !current) return c.json({ error: 'This change can no longer be undone.' }, 409);

  // Written before and after the version lock, as in /fix.
  const back: WorkCopy = { ...restored, imagesFrom: restored.imagesFrom ?? from };
  await saveWork(c.env, fix.revision_id, body.data.expected_version + 1, back, {});
  const { data, error } = await db.rpc('undo_fix', {
    p_fix: body.data.fix_id,
    p_expected_version: body.data.expected_version,
    p_actor: actor,
  });
  if (error) return rpcError(c, error);
  const res = data as { work_version: number; readiness: number; blocking: boolean };
  await saveWork(c.env, fix.revision_id, res.work_version, back, {});
  const touched = [...new Set([...restored.anchors.uids, ...current.anchors.uids])];
  const scored = await rescore(db, fix.revision_id, res.work_version, restored, touched);
  return c.json({
    work_version: res.work_version,
    readiness: scored.readiness ?? res.readiness,
    blocking: scored.blocking ?? res.blocking,
  });
});

/** Mark fixed and send to review (rule 32): reseal what staff changed, then route. */
staff.post('/release', async (c) => {
  const body = z.object({ revision_id: z.uuid() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const db = serviceDb(c.env);
  const actor = c.var.user.sub;
  if (!(await isPublisher(db, actor))) return notStaff(c);
  let rev = await revision(db, body.data.revision_id).catch(() => null);
  if (!rev) return c.json({ error: 'not_found' }, 404);
  if (rev.status !== 'needs_fixes') return c.json({ error: 'This book is not in Needs fixes.' }, 409);
  // Chapters, prices and flags rechecked from the working copy first, in case a fix's rescore
  // did not finish, so the reseal and the blocking check see what the copy holds.
  const work = await loadWork(c.env, rev.id, rev.work_version);
  if (work) {
    const synced = await rescore(db, rev.id, rev.work_version, work, work.anchors.uids);
    if (!synced.applied)
      return c.json({ error: 'Someone else changed this book. Reload to see their changes.' }, 409);
  }
  const { data: blocking } = await db.rpc('has_blocking_flag', { p_rev: rev.id });
  if (blocking) return c.json({ error: 'Fix the issues that block publishing first.' }, 409);

  if (rev.sealed_work_version !== rev.work_version || rev.sealed_generation !== rev.generation) {
    const { error } = await db.rpc('begin_reseal', { p_rev: rev.id, p_actor: actor });
    if (error) return rpcError(c, error);
    rev = await revision(db, rev.id);
    await sealStage(c.env, db, rev);
  }
  const { data, error } = await db.rpc('release_to_review', { p_rev: rev.id, p_actor: actor });
  if (error) return rpcError(c, error);
  return c.json(data);
});

/** A short-lived link to the plain working copy (rule 19): the revision's author or staff. */
staff.post('/preview-url', async (c) => {
  const body = z.object({ revision_id: z.uuid() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  // get_revision_status lets in the book's author and staff only.
  const { error } = await userDb(c).rpc('get_revision_status', { p_rev: body.data.revision_id });
  if (error) return rpcError(c, error);
  const rev = await revision(serviceDb(c.env), body.data.revision_id);
  const work = await loadWork(c.env, rev.id, rev.work_version);
  if (!work) return c.json({ error: 'The preview is not ready yet.' }, 409);
  const link = await signedUrl(c, `work/${rev.id}/`, { get: true });
  return c.json({
    book_url: `${link.url}v${rev.work_version}/book.json`,
    images_url: `${link.url}v${work.imagesFrom ?? rev.work_version}/`,
    work_version: rev.work_version,
    expires_at: link.expires_at,
  });
});

/** A short-lived link to the author's original file, for Download original on Fix flagged issues. */
staff.post('/source-url', async (c) => {
  const body = z.object({ revision_id: z.uuid() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const db = serviceDb(c.env);
  if (!(await isPublisher(db, c.var.user.sub))) return notStaff(c);
  const rev = await revision(db, body.data.revision_id).catch(() => null);
  if (!rev?.source_key) return c.json({ error: 'not_found' }, 404);
  const link = await signedUrl(c, rev.source_key, { get: true });
  return c.json({ url: `${link.url}source.${rev.source_type}`, expires_at: link.expires_at });
});

export default staff;
