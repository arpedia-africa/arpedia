// Reader keys and downloads (docs/prd/04-reading.md Server, rules 4, 70–72): register a device,
// release the keys a reader is entitled to (wrapped to the device's RSA-OAEP public key), and sign
// short-lived links to the encrypted files. entitled_chapters runs with the reader's JWT, so the
// database decides which chapters; the service role only reads the wrapped keys for those.
import { keyLabel, LICENSE_DAYS, unwrapKey } from '@arpedia/core';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireUser } from '../../auth';
import { serviceDb } from '../../db';
import type { AppEnv } from '../../env';
import { rpcError, userDb } from '../12/http';
import { signUpload } from '../12/tokens';

const reading = new Hono<AppEnv>();
reading.use('*', requireUser);

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
const DAY = 86_400_000;

/** P0001 errors carry the code as the message (flow 03 convention). */
const CODE_STATUS: Record<string, 400 | 403 | 404 | 409 | 429> = {
  not_found: 404,
  not_available: 403,
  stale_revision: 409,
  bad_device: 403,
  device_limit: 409,
  rate_limited: 429,
};
const fail = (c: Context<AppEnv>, e: { code?: string; message: string }) =>
  e.code === 'P0001' ? c.json({ error: e.message }, CODE_STATUS[e.message] ?? 400) : rpcError(c, e);

// ─── POST /devices {name, public_key} → {device_id} ─────────────────────────
const DeviceBody = z.object({
  name: z.string().trim().min(1).max(80),
  // SPKI, base64 (RSA-OAEP 2048 or 3072).
  public_key: z.string().min(100).max(2000),
});

reading.post('/devices', async (c) => {
  const body = DeviceBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'bad_request' }, 400);
  try {
    await importDeviceKey(body.data.public_key);
  } catch {
    return c.json({ error: 'bad_public_key' }, 400);
  }
  const { data, error } = await serviceDb(c.env).rpc('worker_register_device', {
    p_user: c.var.user.sub,
    p_name: body.data.name,
    p_public_key: body.data.public_key,
  });
  if (error) return fail(c, error);
  return c.json({ device_id: data });
});

const importDeviceKey = (spki: string) =>
  crypto.subtle.importKey('spki', unb64(spki), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);

// ─── Key bundle (shared by /keys and /download) ─────────────────────────────
const KeysBody = z.object({
  book_id: z.uuid(),
  revision_id: z.uuid(),
  device_id: z.uuid(),
  chapter_uids: z.array(z.uuid()).max(500).optional(),
});

interface Bundle {
  revision_id: string;
  book_id: string;
  artifact_prefix: string | null;
  keys: { chapter_uid: string | null; wrapped_key: string }[];
  chapters: { chapter_uid: string; ord: number; free_file: string | null; full_file: string | null }[];
}

async function keyBundle(c: Context<AppEnv>, body: z.infer<typeof KeysBody>) {
  // 1. Which chapters, decided by the database as the reader.
  const ent = await userDb(c).rpc('entitled_chapters', {
    p_book: body.book_id,
    p_revision: body.revision_id,
  });
  if (ent.error) return { error: ent.error };
  const allowed = ent.data as {
    revision_id: string;
    all: boolean;
    chapter_uids: string[];
    partial_uids: string[];
  };
  if (allowed.revision_id !== body.revision_id)
    return { error: { code: 'P0001', message: 'stale_revision' } };
  const wanted = body.chapter_uids
    ? allowed.chapter_uids.filter((u) => body.chapter_uids!.includes(u))
    : allowed.chapter_uids;

  // 2. The device must be the reader's, and the licence counts towards the device limit.
  const db = serviceDb(c.env);
  const { data: device, error: devErr } = await db
    .from('devices')
    .select('id, public_key, revoked_at')
    .eq('id', body.device_id)
    .eq('user_id', c.var.user.sub)
    .maybeSingle();
  if (devErr) return { error: devErr };
  if (!device || device.revoked_at) return { error: { code: 'P0001', message: 'bad_device' } };

  const issued = Date.now();
  const validUntil = issued + LICENSE_DAYS * DAY;
  const lic = await db.rpc('worker_record_license', {
    p_user: c.var.user.sub,
    p_device: body.device_id,
    p_book: body.book_id,
    p_revision: body.revision_id,
    p_valid_until: new Date(validUntil).toISOString(),
  });
  if (lic.error) return { error: lic.error };

  // 3. Unwrap with the master key, re-wrap to the device. Plain keys exist only in this request.
  const bundle = await db.rpc('worker_key_bundle', { p_revision: body.revision_id, p_chapter_uids: wanted });
  if (bundle.error) return { error: bundle.error };
  const b = bundle.data as unknown as Bundle;
  const master = unb64(c.env.BOOK_MASTER_KEY);
  const deviceKey = await importDeviceKey(device.public_key);
  const keys = await Promise.all(
    b.keys.map(async (k) => {
      const raw = await unwrapKey(master, unb64(k.wrapped_key), keyLabel(b.revision_id, k.chapter_uid));
      const sealed = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, deviceKey, raw);
      raw.fill(0);
      return { chapter_uid: k.chapter_uid, key: b64(new Uint8Array(sealed)) };
    }),
  );

  const licence = {
    book_id: body.book_id,
    revision_id: body.revision_id,
    device_id: body.device_id,
    issued_at: new Date(issued).toISOString(),
    valid_until: new Date(validUntil).toISOString(),
    chapter_uids: keys.map((k) => k.chapter_uid),
  };
  return { error: null, bundle: b, allowed, wanted, keys, licence, signature: await sign(c, licence) };
}

/** HMAC over the licence (server-verifiable; the app keeps it with the keys). */
async function sign(c: Context<AppEnv>, licence: object) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('license:' + c.env.UPLOAD_SIGNING_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(JSON.stringify(licence)));
  return b64(new Uint8Array(mac));
}

// ─── POST /keys → {keys, licence, signature} ────────────────────────────────
reading.post('/keys', async (c) => {
  const body = KeysBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'bad_request' }, 400);
  const r = await keyBundle(c, body.data);
  if (r.error) return fail(c, r.error);
  return c.json({
    keys: r.keys,
    licence: r.licence,
    signature: r.signature,
    server_time: new Date().toISOString(),
  });
});

// ─── POST /download {…, scope} → {files, keys, licence, signature} ─────────
const DownloadBody = KeysBody.omit({ chapter_uids: true }).extend({ scope: z.enum(['whole', 'owned']) });
const PACKAGE = ['manifest.json', 'META-INF/container.xml', 'content.opf', 'nav.xhtml', 'style.css'];
const URL_TTL_MINUTES = 10;

reading.post('/download', async (c) => {
  const body = DownloadBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'bad_request' }, 400);
  const r = await keyBundle(c, body.data);
  if (r.error) return fail(c, r.error);
  if (body.data.scope === 'whole' && !r.allowed.all) return c.json({ error: 'not_owned' }, 403);
  const prefix = r.bundle.artifact_prefix;
  if (!prefix) return c.json({ error: 'not_available' }, 409);

  // Files in scope: the package, every free file, and the full files of chapters the reader can open.
  // Images ride along (ciphertext; locked ones open only with a chapter key the reader doesn't hold).
  const open = new Set(r.allowed.chapter_uids);
  const paths = new Set(PACKAGE);
  for (const ch of r.bundle.chapters) {
    if (ch.free_file) paths.add(ch.free_file);
    if (ch.full_file && (body.data.scope === 'whole' || open.has(ch.chapter_uid))) paths.add(ch.full_file);
  }
  let cursor: string | undefined;
  do {
    const list = await c.env.BOOKS.list({ prefix: prefix + 'img/', cursor });
    for (const o of list.objects) paths.add(o.key.slice(prefix.length));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);

  // One read link per file (the objects route serves exactly the signed key), 10 minutes.
  const exp = Math.floor(Date.now() / 1000) + URL_TTL_MINUTES * 60;
  const origin = new URL(c.req.url).origin;
  const files = await Promise.all(
    [...paths].map(async (path) => {
      const token = await signUpload(c.env.UPLOAD_SIGNING_KEY, { k: prefix + path, max: 0, exp, use: 'get' });
      return { path, url: `${origin}/v1/books/objects/${token}/f` };
    }),
  );
  return c.json({
    files,
    expires_at: new Date(exp * 1000).toISOString(),
    keys: r.keys,
    licence: r.licence,
    signature: r.signature,
    server_time: new Date().toISOString(),
  });
});

export default reading;
