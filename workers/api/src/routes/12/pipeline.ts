// Verification Worker stages (docs/prd/12-book-pipeline.md rules 9–18, 42). Each stage re-reads
// the revision and does nothing unless it is still the current generation, so a message delivered
// twice (waitUntil and the cron safety net) is harmless. Sealed files go under a fresh prefix per
// attempt; only complete_seal makes one live.
import { type Json, keyLabel, previewTarget, unwrapKey } from '@arpedia/core';
import {
  type BaseChapter,
  type BookAnchors,
  type VerifyFlag,
  type WorkCopy,
  TEXT_CHECKS,
  UnsafeArchiveError,
  assignAnchors,
  carryCopyright,
  checkChapters,
  recutPreview,
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
    .select('*, books!book_revisions_book_id_fkey(title, preview_override_percent)')
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

/** The working copy the base (live) revision was sealed from. */
async function baseWork(env: Env, db: Db, baseId: string | null): Promise<WorkCopy | null> {
  if (!baseId) return null;
  const base = await revision(db, baseId);
  return loadWork(env, baseId, base.sealed_work_version ?? base.work_version);
}

/** The base revision's chapters, paragraph ids and fingerprints, for keeping anchors. */
function baseChapters(work: WorkCopy | null): BaseChapter[] {
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
      front: c.front,
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
  // The book's own preview target (flow 03 admin rule 2, 5–25%), else the 10% default.
  const previewPercent = previewTarget(rev.books?.preview_override_percent);
  const v = verifyPackage(files, { cover: await bytesOf(env, rev.cover_key), previewPercent });
  if (!v.ok) return fail(v.reason, v.message);

  const base = await baseWork(env, db, rev.base_revision_id);
  let work: WorkCopy = {
    v: 1,
    chapters: v.chapters,
    anchors: await assignAnchors(v.chapters, baseChapters(base)),
    preview: v.preview,
    words: v.words,
    pages: v.pages,
    price: v.price,
    untitledBook: v.untitledBook,
    tocChapters: v.tocChapters,
    previewPercent,
  };
  // An update keeps the live revision's copyright page when the new file has none; the text checks
  // run again on the chapter list it was added to.
  const carried = base && carryCopyright(work, base);
  if (carried) {
    work = carried;
    v.flags = [
      ...checkChapters(work.chapters, { untitledBook: v.untitledBook, tocChapters: v.tocChapters }),
      ...v.flags.filter((f) => !TEXT_CHECKS.includes(f.check_key)),
    ];
  }
  const { anchors } = work;
  await saveWork(env, rev.id, rev.work_version, work, v.images);

  // A book the desk made from a PDF says so (rule 22).
  if (rev.source_type === 'pdf')
    v.flags.push(
      { check_key: 'pdf_source', message: 'This book was made from a PDF.' },
      {
        check_key: 'low_structure_confidence',
        message: 'Chapters and paragraphs came from a PDF, so check where they start and end.',
        suggestion: 'Ask the author for the Word file if the chapters look wrong.',
      },
    );
  const flags = locateFlags(v.flags, anchors);
  const { error } = await db.rpc('complete_verify', {
    p_rev: rev.id,
    p_generation: rev.generation,
    p_result: { ok: true, ...countsPayload(work), flags } as unknown as Json,
  });
  if (error) throw error;
}

/** Copyright and contents pages (Default Q51 front matter) are left out of the change. */
const outside = (c: WorkCopy['chapters'][number]) => c.front === 'copyright' || c.front === 'contents';

/**
 * Word-level change against the base revision (rule 42). complete_seal counts the chapters added
 * and removed from the uids, leaving out copyright and contents pages (coordinator decision).
 */
function diff(base: WorkCopy, next: WorkCopy) {
  const words = (t: string) => t.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  const baseText = new Map<string, string>();
  const baseChapter = new Map<string, string>();
  base.chapters.forEach((c, i) =>
    c.blocks.forEach((b, j) => {
      if (outside(c)) return;
      const id = base.anchors.ids[i]![j]!;
      baseText.set(id, b.text);
      baseChapter.set(id, base.anchors.uids[i]!);
    }),
  );
  let inserted = 0;
  let deleted = 0;
  const seen = new Set<string>();
  const changed = new Set<string>();
  next.chapters.forEach((c, i) =>
    c.blocks.forEach((b, j) => {
      if (outside(c)) return;
      const id = next.anchors.ids[i]![j]!;
      const old = baseText.get(id);
      seen.add(id);
      if (old === b.text) return;
      changed.add(next.anchors.uids[i]!);
      if (old === undefined) return void (inserted += words(b.text).length);
      const count = (xs: string[]) =>
        xs.reduce((m, w) => m.set(w, (m.get(w) ?? 0) + 1), new Map<string, number>());
      const a = count(words(old));
      const n = count(words(b.text));
      for (const [w, k] of n) inserted += Math.max(0, k - (a.get(w) ?? 0));
      for (const [w, k] of a) deleted += Math.max(0, k - (n.get(w) ?? 0));
    }),
  );
  for (const [id, text] of baseText)
    if (!seen.has(id)) {
      deleted += words(text).length;
      changed.add(baseChapter.get(id)!);
    }
  const baseUids = new Set(base.anchors.uids);
  const nextUids = new Set(next.anchors.uids);
  const added = [...nextUids].filter((u) => !baseUids.has(u));
  const removed = [...baseUids].filter((u) => !nextUids.has(u));
  return {
    inserted_words: inserted,
    deleted_words: deleted,
    changed_pct: base.words ? Math.round(((inserted + deleted) / base.words) * 100_000) / 1000 : 100,
    chapters_added: added.length,
    chapters_removed: removed.length,
    // Changed chapters the new revision still has; added ones are listed apart.
    changed_chapter_uids: next.anchors.uids.filter((u) => changed.has(u) && baseUids.has(u)),
    added_chapter_uids: added,
    removed_chapter_uids: removed,
  };
}

const stable = (o: unknown) => JSON.stringify(o, Object.keys((o ?? {}) as object).sort());

/** The images a working copy's chapters use, from the version that holds them. */
async function workImages(env: Env, rev: Revision, work: WorkCopy, version: number) {
  const prefix = workPrefix(rev.id, work.imagesFrom ?? version);
  const paths = [
    ...new Set(work.chapters.flatMap((c) => c.blocks.flatMap((b) => (b.images ?? []).map((i) => i.path)))),
  ];
  const images: Record<string, Uint8Array> = Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => {
        const bytes = await bytesOf(env, prefix + path);
        // never seal a blank picture: a missing image fails the attempt, and the queue retries it
        if (!bytes) throw new Error(`image ${prefix + path} missing for ${rev.id}`);
        return [path, bytes] as const;
      }),
    ),
  );
  return images;
}

export async function sealStage(env: Env, db: Db, rev: Revision) {
  const work = await loadWork(env, rev.id, rev.work_version);
  if (!work) throw new Error(`working copy v${rev.work_version} missing for ${rev.id}`);
  const images = await workImages(env, rev, work, rev.work_version);

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

/**
 * Preview override (flow 03 admin rule 2): seal the live revision again with the cut the book wants
 * now (the override, else the revision's own). Keys are kept, so copies on phones still open; the
 * book keeps its price. complete_preview_rebuild makes it live only if nothing changed meanwhile.
 */
export async function previewRebuild(env: Env, bookId: string): Promise<void> {
  const db = serviceDb(env);
  const { data: book, error } = await db
    .from('books')
    .select('id, title, current_revision_id, preview_override_percent, price_override_credits')
    .eq('id', bookId)
    .maybeSingle();
  if (error) throw error;
  if (!book?.current_revision_id) return;
  const rev = await revision(db, book.current_revision_id);
  const version = rev.sealed_work_version;
  if (!rev.artifact_prefix || version === null) return;
  const target = Number(book.preview_override_percent ?? rev.preview_percent ?? 10);
  const price = book.price_override_credits ?? rev.price_credits ?? 0;

  const work = await loadWork(env, rev.id, version);
  if (!work) throw new Error(`working copy v${version} missing for ${rev.id}`);
  const { preview, chapters } = recutPreview(work.chapters, target, price);

  const { data: bundle, error: kErr } = await db.rpc('worker_key_bundle', {
    p_revision: rev.id,
    p_chapter_uids: work.anchors.uids,
  });
  if (kErr) throw kErr;
  const master = unb64(env.BOOK_MASTER_KEY);
  const held = await Promise.all(
    (bundle as unknown as { keys: { chapter_uid: string | null; wrapped_key: string }[] }).keys.map(
      async (k) =>
        [
          k.chapter_uid,
          await unwrapKey(master, unb64(k.wrapped_key), keyLabel(rev.id, k.chapter_uid)),
        ] as const,
    ),
  );
  const keys = {
    free: held.find(([uid]) => uid === null)?.[1],
    chapters: Object.fromEntries(held.filter(([uid]) => uid !== null)) as Record<string, Uint8Array>,
  };

  const out = await sealBook({
    bookId: rev.book_id,
    revisionId: rev.id,
    title: (rev.meta as { title?: string } | null)?.title ?? book.title ?? '',
    chapters,
    images: await workImages(env, rev, work, version),
    preview,
    price,
    pages: rev.pages ?? work.pages,
    masterKey: master,
    anchors: work.anchors,
    keys,
  });
  const artifact = `books/${rev.id}/p${String(target).replace('.', '_')}-${crypto.randomUUID().slice(0, 8)}/`;
  await Promise.all(Object.entries(out.files).map(([path, bytes]) => env.BOOKS.put(artifact + path, bytes)));

  const { data: done, error: cErr } = await db.rpc('complete_preview_rebuild', {
    p_rev: rev.id,
    p_target: target,
    p_seal: {
      artifact_prefix: artifact,
      manifest_key: artifact + 'manifest.json',
      chapters: out.chapters,
      keys: out.keys,
      prices: out.prices,
      preview_percent: preview.percent,
      preview_cut_para_id: work.anchors.ids[preview.chapter]![preview.paragraph]!,
      preview_cut_chapter_uid: work.anchors.uids[preview.chapter]!,
      free_through_ord: preview.freeThrough,
    } as unknown as Json,
  });
  if (cErr) throw cErr;
  // Overtaken (a newer override or revision queued its own rebuild): these files are never served.
  if (!(done as { applied?: boolean } | null)?.applied)
    await Promise.all(Object.keys(out.files).map((path) => env.BOOKS.delete(artifact + path)));
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

/** A job on book_verify that is not a revision stage. */
interface JobMsg {
  kind: string;
  book_id?: string;
}

/** Cron safety net (every minute): retry what waitUntil did not finish; give up after 3 tries. */
export async function consumeQueue(env: Env): Promise<void> {
  const db = serviceDb(env);
  const { data, error } = await db.rpc('book_queue_read', { p_queue: 'book_verify', p_vt: 600, p_qty: 5 });
  if (error) throw error;
  for (const m of (data ?? []) as unknown as {
    msg_id: number;
    read_ct: number;
    message: StageMsg | JobMsg;
  }[]) {
    try {
      if ('kind' in m.message) {
        const job = m.message;
        // preview_rebuild is the only job; anything else (the retired reprice_all: pricing rules
        // apply in apply_pricing_rules, flow 16) is acked so it can't block the queue.
        if (job.kind === 'preview_rebuild' && job.book_id) {
          if (m.read_ct > 3) console.error('preview rebuild gave up', job);
          else await previewRebuild(env, job.book_id);
        } else console.warn('book_verify: unknown job dropped', job);
      } else if (m.read_ct > 3 && m.message.stage === 'seal') {
        // Not the author's file: keep their confirmed chapters, retry hourly, alert the Publisher.
        const { error: sf } = await db.rpc('seal_failed', {
          p_rev: m.message.revision_id,
          p_generation: m.message.generation,
        });
        if (sf) throw sf;
      } else if (m.read_ct > 3) {
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
