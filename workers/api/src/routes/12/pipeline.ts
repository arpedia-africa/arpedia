// Verification Worker stages (docs/prd/12-book-pipeline.md rules 9–18, 42). Each stage re-reads
// the revision and does nothing unless it is still the current generation, so a message delivered
// twice (waitUntil and the cron safety net) is harmless. Sealed files go under a fresh prefix per
// attempt; only complete_seal makes one live.
import type { Json } from '@arpedia/core';
import {
  type BaseChapter,
  type BookAnchors,
  type VerifyFlag,
  type WorkCopy,
  UnsafeArchiveError,
  assignAnchors,
  safeUnzip,
  sealBook,
  verifyPackage,
} from '@arpedia/convert';
import { serviceDb } from '../../db';
import type { Env } from '../../env';

export type { WorkCopy };

export interface StageMsg {
  revision_id: string;
  stage: 'verify' | 'seal';
  generation: number;
}

export const workPrefix = (rev: string, version: number) => `work/${rev}/v${version}/`;
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const bytesOf = async (env: Env, key: string | null) => {
  if (!key) return null;
  const o = await env.BOOKS.get(key);
  return o ? new Uint8Array(await o.arrayBuffer()) : null;
};

type Db = ReturnType<typeof serviceDb>;
export type Revision = Awaited<ReturnType<typeof revision>>;

export async function revision(db: Db, id: string) {
  const { data, error } = await db
    .from('book_revisions')
    .select('*, books!book_revisions_book_id_fkey(title)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function loadWork(env: Env, rev: string, version: number): Promise<WorkCopy | null> {
  const o = await env.BOOKS.get(workPrefix(rev, version) + 'book.json');
  return o ? ((await o.json()) as WorkCopy) : null;
}

export async function saveWork(
  env: Env,
  rev: string,
  version: number,
  work: WorkCopy,
  images: Record<string, Uint8Array>,
) {
  const prefix = workPrefix(rev, version);
  await Promise.all(Object.entries(images).map(([path, bytes]) => env.BOOKS.put(prefix + path, bytes)));
  await env.BOOKS.put(prefix + 'book.json', JSON.stringify(work), {
    httpMetadata: { contentType: 'application/json' },
  });
}

/** The live revision's chapters, paragraph ids and fingerprints, for keeping anchors. */
async function baseChapters(env: Env, db: Db, baseId: string | null): Promise<BaseChapter[]> {
  if (!baseId) return [];
  const base = await revision(db, baseId);
  const work = await loadWork(env, baseId, base.sealed_work_version ?? base.work_version);
  if (!work) return [];
  return work.chapters.map((c, i) => ({
    chapter_uid: work.anchors.uids[i]!,
    title: c.title,
    paragraphs: c.blocks.map((b, j) => ({
      id: work.anchors.ids[i]![j]!,
      fp: work.anchors.fps[i]![j]!,
      text: b.text || b.html,
    })),
  }));
}

/** What complete_verify / confirm_chapters record for a working copy. */
export function countsPayload(work: WorkCopy) {
  const { chapters, anchors, preview } = work;
  return {
    words: work.words,
    pages: work.pages,
    price_credits: work.price,
    preview_percent: preview.percent,
    preview_cut_para_id: anchors.ids[preview.chapter]![preview.paragraph]!,
    preview_cut_chapter_uid: anchors.uids[preview.chapter]!,
    free_through_ord: preview.freeThrough,
    chapters: chapters.map((c, ord) => ({
      chapter_uid: anchors.uids[ord],
      ord,
      kind: c.kind,
      parent_ord: c.parentOrd,
      title: c.title,
      words: c.words,
      words_before: c.wordsBefore,
      pages: c.pages,
      price_credits: c.priceCredits,
    })),
  };
}

/**
 * Flags as stored: chapter ords and block indexes become chapter uids and paragraph ids, which stay
 * put when chapters move. A fix op that names a chapter carries its uid too.
 */
export function locateFlags(flags: VerifyFlag[], anchors: BookAnchors) {
  return flags.map(
    (
      f,
    ): {
      check_key: string;
      message: string;
      suggestion: string | null;
      auto_fixable: boolean;
      fix_op: Record<string, unknown> | null;
      location: { chapter_uid?: string; para_id?: string; image?: string };
    } => {
      const ord = f.location?.chapter_ord;
      const uid = ord === undefined ? undefined : anchors.uids[ord];
      return {
        check_key: f.check_key,
        message: f.message,
        suggestion: f.suggestion ?? null,
        auto_fixable: f.auto_fixable ?? false,
        fix_op: f.fix_op
          ? (({ chapter_ord: _ord, ...op }) => (uid ? { ...op, chapter_uid: uid } : op))(f.fix_op)
          : null,
        location:
          ord === undefined
            ? {}
            : {
                chapter_uid: uid,
                ...(f.location?.block !== undefined ? { para_id: anchors.ids[ord]![f.location.block] } : {}),
                ...(f.location?.image ? { image: f.location.image } : {}),
              },
      };
    },
  );
}

async function verifyStage(env: Env, db: Db, rev: Revision) {
  const fail = (reason: string, message?: string) =>
    db.rpc('complete_verify', {
      p_rev: rev.id,
      p_generation: rev.generation,
      p_result: { ok: false, reason, message } as Json,
    });
  const pkg = await bytesOf(env, rev.converted_key);
  if (!pkg) return fail('worker_failed');
  let files: Record<string, Uint8Array>;
  try {
    files = safeUnzip(pkg);
  } catch (e) {
    if (e instanceof UnsafeArchiveError)
      return fail('unreadable', 'We could not open this file safely. Please upload it again from Word.');
    return fail('unreadable');
  }
  const v = verifyPackage(files, { cover: await bytesOf(env, rev.cover_key), previewPercent: 10 });
  if (!v.ok) return fail(v.reason, v.message);

  const anchors = await assignAnchors(v.chapters, await baseChapters(env, db, rev.base_revision_id));
  const work: WorkCopy = {
    v: 1,
    chapters: v.chapters,
    anchors,
    preview: v.preview,
    words: v.words,
    pages: v.pages,
    price: v.price,
  };
  await saveWork(env, rev.id, rev.work_version, work, v.images);

  const flags = locateFlags(v.flags, anchors);
  const { error } = await db.rpc('complete_verify', {
    p_rev: rev.id,
    p_generation: rev.generation,
    p_result: { ok: true, ...countsPayload(work), flags } as unknown as Json,
  });
  if (error) throw error;
}

/** Word-level change against the base revision (rule 42). */
function diff(base: WorkCopy, next: WorkCopy) {
  const words = (t: string) => t.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  const baseText = new Map<string, string>();
  base.chapters.forEach((c, i) => c.blocks.forEach((b, j) => baseText.set(base.anchors.ids[i]![j]!, b.text)));
  let inserted = 0;
  let deleted = 0;
  const seen = new Set<string>();
  next.chapters.forEach((c, i) =>
    c.blocks.forEach((b, j) => {
      const id = next.anchors.ids[i]![j]!;
      const old = baseText.get(id);
      seen.add(id);
      if (old === undefined) return void (inserted += words(b.text).length);
      if (old === b.text) return;
      const count = (xs: string[]) =>
        xs.reduce((m, w) => m.set(w, (m.get(w) ?? 0) + 1), new Map<string, number>());
      const a = count(words(old));
      const n = count(words(b.text));
      for (const [w, k] of n) inserted += Math.max(0, k - (a.get(w) ?? 0));
      for (const [w, k] of a) deleted += Math.max(0, k - (n.get(w) ?? 0));
    }),
  );
  for (const [id, text] of baseText) if (!seen.has(id)) deleted += words(text).length;
  const baseUids = new Set(base.anchors.uids);
  const nextUids = new Set(next.anchors.uids);
  return {
    inserted_words: inserted,
    deleted_words: deleted,
    changed_pct: base.words ? Math.round(((inserted + deleted) / base.words) * 100_000) / 1000 : 100,
    chapters_added: [...nextUids].filter((u) => !baseUids.has(u)).length,
    chapters_removed: [...baseUids].filter((u) => !nextUids.has(u)).length,
  };
}

const stable = (o: unknown) => JSON.stringify(o, Object.keys((o ?? {}) as object).sort());

export async function sealStage(env: Env, db: Db, rev: Revision) {
  const work = await loadWork(env, rev.id, rev.work_version);
  if (!work) throw new Error(`working copy v${rev.work_version} missing for ${rev.id}`);
  const prefix = workPrefix(rev.id, work.imagesFrom ?? rev.work_version);
  const images: Record<string, Uint8Array> = {};
  for (const c of work.chapters)
    for (const b of c.blocks)
      for (const img of b.images ?? [])
        images[img.path] ??= (await bytesOf(env, prefix + img.path)) ?? new Uint8Array();

  const out = await sealBook({
    bookId: rev.book_id,
    revisionId: rev.id,
    title: (rev.meta as { title?: string } | null)?.title ?? rev.books?.title ?? '',
    chapters: work.chapters,
    images,
    preview: work.preview,
    price: work.price,
    pages: work.pages,
    masterKey: unb64(env.BOOK_MASTER_KEY),
    anchors: work.anchors,
  });
  const artifact = `books/${rev.id}/g${rev.generation}-${crypto.randomUUID().slice(0, 8)}/`;
  await Promise.all(Object.entries(out.files).map(([path, bytes]) => env.BOOKS.put(artifact + path, bytes)));

  let revisionDiff: Record<string, unknown> | undefined;
  if (rev.base_revision_id) {
    const base = await revision(db, rev.base_revision_id);
    const baseWork = await loadWork(env, base.id, base.sealed_work_version ?? base.work_version);
    if (baseWork)
      revisionDiff = {
        ...diff(baseWork, work),
        cover_changed: (rev.cover_sha256 ?? null) !== (base.cover_sha256 ?? null),
        metadata_changed: stable(rev.meta) !== stable(base.meta),
      };
  }
  const { error } = await db.rpc('complete_seal', {
    p_rev: rev.id,
    p_generation: rev.generation,
    p_seal: {
      artifact_prefix: artifact,
      manifest_key: artifact + 'manifest.json',
      work_version: rev.work_version,
      chapters: out.chapters,
      keys: out.keys,
      anchors: out.anchors,
      anchor_migrations: out.anchor_migrations,
      prices: out.prices,
      ...(revisionDiff ? { diff: revisionDiff } : {}),
    } as unknown as Json,
  });
  if (error) throw error;
}

/** Run one stage if the revision still wants it. */
export async function runStage(env: Env, msg: StageMsg): Promise<void> {
  const db = serviceDb(env);
  const rev = await revision(db, msg.revision_id);
  if (rev.status !== 'processing' || rev.generation !== msg.generation) return;
  if (msg.stage === 'verify' && rev.draft_step === 'checking') await verifyStage(env, db, rev);
  if (msg.stage === 'seal' && rev.draft_step === null && rev.sealed_generation !== rev.generation)
    await sealStage(env, db, rev);
}

/** Cron safety net (every minute): retry what waitUntil did not finish; give up after 3 tries. */
export async function consumeQueue(env: Env): Promise<void> {
  const db = serviceDb(env);
  const { data, error } = await db.rpc('book_queue_read', { p_queue: 'book_verify', p_vt: 600, p_qty: 5 });
  if (error) throw error;
  for (const m of (data ?? []) as unknown as { msg_id: number; read_ct: number; message: StageMsg }[]) {
    try {
      if (m.read_ct > 3) {
        const rev = await revision(db, m.message.revision_id);
        if (rev.status === 'processing' && rev.generation === m.message.generation)
          await db.rpc('complete_verify', {
            p_rev: rev.id,
            p_generation: rev.generation,
            p_result: { ok: false, reason: 'worker_failed' } as Json,
          });
      } else await runStage(env, m.message);
      await db.rpc('book_queue_ack', { p_queue: 'book_verify', p_msg_id: m.msg_id });
    } catch (e) {
      console.error('book stage failed', m.message, e);
    }
  }
}
