import { Hono } from 'hono';
import { imageType } from '@arpedia/convert';
import { serviceDb } from '../../db';
import type { AppEnv } from '../../env';

// Spec check 03-7, 05-7, 07-11: public book covers for the app (book band, Library, rooms, rails).
// `GET /v1/covers/{rev}` serves a revision's uploaded cover only when `public_cover_key` says readers
// can see that book (released, scheduled or unpublished; never drafts, books in review, taken-down,
// rejected or held under a claim). Uploads are untrusted, so only real JPEG, PNG or WebP bytes go out,
// typed from their own bytes. A revision's cover never changes (a new cover is a new revision), so
// phones and the edge may keep it a day; a takedown stops new fetches at once.
const covers = new Hono<AppEnv>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

covers.get('/:rev', async (c) => {
  const rev = c.req.param('rev').toLowerCase();
  if (!UUID.test(rev)) return c.notFound();
  const { data: key, error } = await serviceDb(c.env).rpc('public_cover_key', { p_rev: rev });
  if (error) {
    console.error('[covers]', error.message);
    return c.json({ error: 'internal' }, 500);
  }
  if (!key) return c.notFound();
  const obj = await c.env.BOOKS.get(key);
  if (!obj) return c.notFound();
  const bytes = new Uint8Array(await obj.arrayBuffer());
  const kind = imageType(bytes);
  if (!kind || kind === 'gif') return c.notFound();
  return new Response(bytes, {
    headers: {
      'Content-Type': TYPES[kind],
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      ETag: `"${obj.etag}"`,
    },
  });
});

export default covers;
