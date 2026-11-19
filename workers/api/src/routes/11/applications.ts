// Flow 11 · author applications (docs/prd/11-author-studio.md rules 5 and 10, Server).
//   POST /v1/author-applications/sample/upload   {file_name, content_type, size} → {upload_url, key, expires_at}
//   PUT  <upload_url> (X-Content-SHA256, the file)  → stored in R2 by the flow 12 object route
//   POST /v1/author-applications/sample/complete {key, file_name} → {sample_pages, sample_file_name}
//   GET  /v1/author-applications/:id/sample        → {url, expires_at}: a 5-minute read link (staff, applicant)
// Samples live under the private prefix applications/<user>/; nothing serves them without a signed link.
// The application_checks queue is drained by the cron (consumeApplicationChecks).
import {
  SAMPLE_MAX_BYTES,
  SAMPLE_MAX_PAGES,
  SAMPLE_TYPES,
  WORDS_PER_PAGE,
  shingles,
  similarityPct,
  type Json,
} from '@arpedia/core';
import { strFromU8, Unzlib, unzipSync } from 'fflate';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser } from '../../auth';
import { serviceDb } from '../../db';
import type { AppEnv, Env } from '../../env';
import { rpcError, signedUrl, userDb } from '../12/http';

const applications = new Hono<AppEnv>();
applications.use('*', requireUser);

const EXCERPT_CHARS = 4000;
/** Most a sample may inflate to (zip and PDF streams are untrusted: no zip bombs). */
const MAX_INFLATED = 16 * 1024 * 1024;

type Inspected =
  | { ok: true; pages: number; excerpt: string | null }
  | { ok: false; error: 'wrong_type' | 'too_many_pages' | 'unreadable' };

/** Word: pages from docProps/app.xml (Word writes it), else 250 words a page; text for the excerpt. */
function inspectDocx(bytes: Uint8Array): Inspected {
  let files: Record<string, Uint8Array>;
  let tooBig = false;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (f.name !== 'word/document.xml' && f.name !== 'docProps/app.xml') return false;
        if (f.originalSize > MAX_INFLATED) tooBig = true;
        return !tooBig;
      },
    });
  } catch {
    return { ok: false, error: 'unreadable' };
  }
  if (tooBig) return { ok: false, error: 'unreadable' };
  const doc = files['word/document.xml'];
  if (!doc) return { ok: false, error: 'wrong_type' };
  const text = strFromU8(doc)
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const app = files['docProps/app.xml'];
  const stated = app ? Number(/<Pages>(\d+)<\/Pages>/.exec(strFromU8(app))?.[1] ?? NaN) : NaN;
  const words = text.split(/\s+/).filter(Boolean).length;
  const pages =
    Number.isFinite(stated) && stated > 0 ? stated : Math.max(1, Math.ceil(words / WORDS_PER_PAGE));
  if (pages > SAMPLE_MAX_PAGES) return { ok: false, error: 'too_many_pages' };
  return { ok: true, pages, excerpt: text ? text.slice(0, EXCERPT_CHARS) : null };
}

/** zlib-inflates one stream in small pushes, giving up past `budget.left` bytes of output. */
function inflateCapped(data: Uint8Array, budget: { left: number }): Uint8Array | null {
  const parts: Uint8Array[] = [];
  let over = false;
  const z = new Unzlib((chunk) => {
    budget.left -= chunk.length;
    if (budget.left < 0) over = true;
    else parts.push(chunk);
  });
  try {
    for (let i = 0; i < data.length && !over; i += 4096) {
      z.push(data.subarray(i, i + 4096), i + 4096 >= data.length);
    }
  } catch {
    return null;
  }
  if (over) return null;
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Page-tree nodes in some PDF text: their /Count and whether they are the root (no /Parent). */
function pageNodes(src: string) {
  const nodes: { count: number; root: boolean }[] = [];
  for (const m of src.matchAll(/\/Type\s*\/Pages\b/g)) {
    const start = src.lastIndexOf('<<', m.index);
    const end = src.indexOf('>>', m.index);
    const dict = src.slice(start < 0 ? m.index : start, end < 0 ? undefined : end);
    const count = /\/Count\s+(\d+)/.exec(dict);
    if (count) nodes.push({ count: Number(count[1]), root: !/\/Parent\b/.test(dict) });
  }
  return nodes;
}

/**
 * PDF: page count from the root of the page tree, also inside compressed object streams (PDF 1.5+,
 * Word and Google Docs exports). The last root wins (incremental saves append). A file whose page
 * count can't be found is refused, so the 10-page limit always holds. Text is not extracted.
 */
function inspectPdf(bytes: Uint8Array): Inspected {
  const src = new TextDecoder('latin1').decode(bytes);
  const nodes = pageNodes(src);
  if (!nodes.some((n) => n.root)) {
    const budget = { left: MAX_INFLATED };
    for (const m of src.matchAll(/\/Type\s*\/ObjStm\b[^]*?stream\r?\n/g)) {
      const from = m.index + m[0].length;
      const to = src.indexOf('endstream', from);
      if (to < 0) break;
      const raw = inflateCapped(bytes.subarray(from, to), budget);
      if (!raw) {
        if (budget.left < 0) return { ok: false, error: 'unreadable' };
        continue;
      }
      nodes.push(...pageNodes(new TextDecoder('latin1').decode(raw)));
    }
  }
  const roots = nodes.filter((n) => n.root);
  const pages = roots.length ? roots[roots.length - 1]!.count : null;
  if (!pages) return { ok: false, error: 'unreadable' };
  if (pages > SAMPLE_MAX_PAGES) return { ok: false, error: 'too_many_pages' };
  return { ok: true, pages, excerpt: null };
}

export function inspectSample(bytes: Uint8Array, ext: 'pdf' | 'docx'): Inspected {
  const head = String.fromCharCode(...bytes.subarray(0, 5));
  if (ext === 'pdf') return head === '%PDF-' ? inspectPdf(bytes) : { ok: false, error: 'wrong_type' };
  return head.startsWith('PK\x03\x04') ? inspectDocx(bytes) : { ok: false, error: 'wrong_type' };
}

const MESSAGES = {
  wrong_type: 'This file is not a Word (.docx) or PDF file. Pick another file or paste your text.',
  too_large: 'This file is over 5 MB. Pick a shorter sample or paste your text.',
  too_many_pages: `Your sample can be up to ${SAMPLE_MAX_PAGES} pages. Pick a shorter part of your writing.`,
  unreadable: 'We could not open this file. Try saving it again as Word (.docx), or paste your text.',
} as const;

const UploadBody = z.object({
  file_name: z.string().min(1).max(200),
  content_type: z.string(),
  size: z.number().int().positive(),
});

applications.post('/sample/upload', async (c) => {
  const body = UploadBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'bad_request' }, 400);
  const ext = SAMPLE_TYPES[body.data.content_type as keyof typeof SAMPLE_TYPES];
  if (!ext) return c.json({ error: 'wrong_type', message: MESSAGES.wrong_type }, 415);
  if (body.data.size > SAMPLE_MAX_BYTES)
    return c.json({ error: 'too_large', message: MESSAGES.too_large }, 413);
  // Only while the caller has a draft (or a question to answer): RLS shows them their own row.
  const { data: app } = await userDb(c)
    .from('author_applications')
    .select('id')
    .eq('user_id', c.var.user.sub)
    .in('status', ['draft', 'needs_info'])
    .maybeSingle();
  if (!app) return c.json({ error: 'no_application' }, 409);
  const key = `applications/${c.var.user.sub}/${crypto.randomUUID()}.${ext}`;
  const link = await signedUrl(c, key, { max: SAMPLE_MAX_BYTES });
  return c.json({ upload_url: link.url, key, expires_at: link.expires_at });
});

const CompleteBody = z.object({ key: z.string(), file_name: z.string().min(1).max(200) });

applications.post('/sample/complete', async (c) => {
  const body = CompleteBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'bad_request' }, 400);
  const uid = c.var.user.sub;
  const m = new RegExp(`^applications/${uid}/[0-9a-f-]{36}\\.(pdf|docx)$`).exec(body.data.key);
  if (!m) return c.json({ error: 'forbidden' }, 403);
  const obj = await c.env.BOOKS.get(body.data.key);
  if (!obj) return c.json({ error: 'not_uploaded' }, 404);
  if (obj.size > SAMPLE_MAX_BYTES) {
    await c.env.BOOKS.delete(body.data.key);
    return c.json({ error: 'too_large', message: MESSAGES.too_large }, 413);
  }
  const result = inspectSample(new Uint8Array(await obj.arrayBuffer()), m[1] as 'pdf' | 'docx');
  if (!result.ok) {
    await c.env.BOOKS.delete(body.data.key);
    return c.json({ error: result.error, message: MESSAGES[result.error] }, 422);
  }
  const db = serviceDb(c.env);
  const { data: before } = await db
    .from('author_applications')
    .select('sample_file_key')
    .eq('user_id', uid)
    .in('status', ['draft', 'needs_info'])
    .maybeSingle();
  const { data, error } = await db.rpc('set_application_sample', {
    p_user: uid,
    p_key: body.data.key,
    p_name: body.data.file_name,
    p_pages: result.pages,
    p_excerpt: result.excerpt ?? undefined,
  });
  if (error) {
    await c.env.BOOKS.delete(body.data.key);
    return rpcError(c, error);
  }
  // The file it replaced is no longer anyone's sample.
  const old = before?.sample_file_key;
  if (old && old !== body.data.key) await c.env.BOOKS.delete(old);
  return c.json({ sample_pages: data.sample_pages, sample_file_name: data.sample_file_name });
});

applications.get('/:id/sample', async (c) => {
  // RLS decides who sees the row: the applicant, Publisher, Support (and Super admin).
  const { data } = await userDb(c)
    .from('author_applications')
    .select('sample_file_key, sample_file_name')
    .eq('id', c.req.param('id'))
    .maybeSingle();
  if (!data?.sample_file_key) return c.json({ error: 'not_found' }, 404);
  const link = await signedUrl(c, data.sample_file_key, { get: true });
  const name = data.sample_file_key.split('/').pop()!;
  return c.json({ url: link.url + name, file_name: data.sample_file_name, expires_at: link.expires_at });
});

/** Cron: sample similarity for sent applications (rule 10). A failed check never auto-rejects. */
export async function consumeApplicationChecks(env: Env): Promise<void> {
  const db = serviceDb(env);
  const { data, error } = await db.rpc('author_queue_read', { p_queue: 'application_checks' });
  if (error) throw error;
  for (const m of (data ?? []) as unknown as {
    msg_id: number;
    read_ct: number;
    message: { application_id: string };
  }[]) {
    try {
      const app = m.message.application_id;
      let checks: Record<string, Json>;
      if (m.read_ct > 5) {
        checks = { similarity_pct: null, similarity_failed: true };
      } else {
        const { data: rows, error: ce } = await db.rpc('application_similarity_corpus', { p_app: app });
        if (ce) throw ce;
        const mine = rows?.find((r) => r.mine);
        const sample = shingles(mine?.body ?? '');
        let best = 0;
        let similarTo: string | null = null;
        for (const r of rows ?? []) {
          if (r.mine) continue;
          const pct = similarityPct(sample, shingles(r.body));
          if (pct > best) [best, similarTo] = [pct, r.id];
        }
        checks = mine ? { similarity_pct: best, similar_to: similarTo } : { similarity_pct: null };
      }
      const { error: we } = await db.rpc('complete_application_checks', { p_app: app, p_checks: checks });
      if (we) throw we;
      await db.rpc('author_queue_ack', { p_queue: 'application_checks', p_msg_id: m.msg_id });
    } catch (e) {
      console.error('application check failed', m.message, e);
    }
  }
}

export default applications;
