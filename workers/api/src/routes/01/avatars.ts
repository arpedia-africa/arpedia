import { Hono } from 'hono';
import { requireUser } from '../../auth';
import { serviceDb } from '../../db';
import type { AppEnv, Env } from '../../env';

// Flow 01 · profile photos. The phone resizes to 512×512 WebP (under 200 KB) before asking.
//   POST /v1/avatars/upload {content_type} → {upload_url, final_url, expires_at}
//   PUT  <upload_url> (same bearer token, image body)  → {avatar_url}; also saved on the profile
//   GET  /v1/avatars/<user_id>/<file>                    → the image (public, cached)
// The upload URL is signed by this Worker (HMAC over key, type and expiry) and only writes
// `avatars/<caller>/…` in R2, so no S3 credentials are needed and nobody can write elsewhere.

const TYPES: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const MAX_BYTES = 2 * 1024 * 1024;
const URL_LIFE_S = 10 * 60;

const avatars = new Hono<AppEnv>();

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Signing key derived from the service key, so there is no extra secret to manage. */
async function sign(env: Env, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(`arpedia-avatar-upload:${env.SUPABASE_SERVICE_ROLE_KEY}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/** Origin for URLs saved on profiles: the configured public one, so they survive a domain move. */
const publicOrigin = (env: Env, reqUrl: string) =>
  (env.PUBLIC_API_URL ?? new URL(reqUrl).origin).replace(/\/+$/, '');

/** The body, or null as soon as it passes `max` bytes (a chunked body has no Content-Length). */
async function readAtMost(body: ReadableStream<Uint8Array> | null, max: number) {
  const out = new Uint8Array(max);
  let size = 0;
  if (!body) return out.subarray(0, 0);
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out.subarray(0, size);
    if (size + value.byteLength > max) {
      await reader.cancel();
      return null;
    }
    out.set(value, size);
    size += value.byteLength;
  }
}

/** Constant-time compare of two hex strings. */
function sameHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Magic bytes, so a renamed file can't pass as an image. */
function sniff(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  const tag = (o: number) => String.fromCharCode(...bytes.slice(o, o + 4));
  if (tag(0) === 'RIFF' && tag(8) === 'WEBP') return 'image/webp';
  return null;
}

avatars.post('/upload', requireUser, async (c) => {
  const body = await c.req.json<{ content_type?: string }>().catch(() => ({}) as { content_type?: string });
  const type = body.content_type ?? '';
  const ext = TYPES[type];
  if (!ext) return c.json({ error: 'unsupported_type' }, 415);
  const uid = c.var.user.sub;
  const key = `avatars/${uid}/${crypto.randomUUID()}.${ext}`;
  const exp = Math.floor(Date.now() / 1000) + URL_LIFE_S;
  const sig = await sign(c.env, `${key}|${type}|${exp}`);
  const origin = publicOrigin(c.env, c.req.url);
  const path = key.slice('avatars/'.length);
  return c.json({
    upload_url: `${origin}/v1/avatars/${path}?type=${encodeURIComponent(type)}&exp=${exp}&sig=${sig}`,
    final_url: `${origin}/v1/avatars/${path}`,
    expires_at: new Date(exp * 1000).toISOString(),
  });
});

avatars.put('/:uid/:file', requireUser, async (c) => {
  const { uid, file } = c.req.param();
  const type = c.req.query('type') ?? '';
  const exp = Number(c.req.query('exp'));
  const sig = c.req.query('sig') ?? '';
  const key = `avatars/${uid}/${file}`;
  if (uid !== c.var.user.sub) return c.json({ error: 'forbidden' }, 403);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return c.json({ error: 'expired' }, 403);
  if (!sameHex(sig, await sign(c.env, `${key}|${type}|${exp}`)))
    return c.json({ error: 'bad_signature' }, 403);

  const declared = Number(c.req.header('Content-Length') ?? '0');
  if (declared > MAX_BYTES) return c.json({ error: 'too_large' }, 413);
  const bytes = await readAtMost(c.req.raw.body, MAX_BYTES);
  if (!bytes) return c.json({ error: 'too_large' }, 413);
  if (bytes.byteLength === 0) return c.json({ error: 'empty' }, 400);
  if (sniff(bytes) !== type) return c.json({ error: 'not_an_image' }, 415);

  await c.env.BOOKS.put(key, bytes, {
    httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' },
  });
  const avatarUrl = `${publicOrigin(c.env, c.req.url)}/v1/avatars/${uid}/${file}`;
  const db = serviceDb(c.env);
  const { data: before } = await db.from('profiles').select('avatar_url').eq('id', uid).single();
  const { error } = await db.from('profiles').update({ avatar_url: avatarUrl }).eq('id', uid);
  if (error) throw new Error(`avatar_url update failed: ${error.message}`);
  // The previous photo (one of ours, any origin) is no longer shown anywhere.
  const old = /\/v1\/avatars\/([0-9a-f-]{36})\/([0-9a-f-]{36}\.(?:webp|jpg|png))$/.exec(
    before?.avatar_url ?? '',
  );
  if (old && old[1] === uid && old[2] !== file) await c.env.BOOKS.delete(`avatars/${uid}/${old[2]}`);
  return c.json({ avatar_url: avatarUrl });
});

avatars.get('/:uid/:file', async (c) => {
  const { uid, file } = c.req.param();
  if (!/^[0-9a-f-]{36}$/.test(uid) || !/^[0-9a-f-]{36}\.(webp|jpg|png)$/.test(file)) return c.notFound();
  const obj = await c.env.BOOKS.get(`avatars/${uid}/${file}`);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

export default avatars;
