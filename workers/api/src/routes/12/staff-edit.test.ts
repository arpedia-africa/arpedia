import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv, Env } from '../../env';

const userRpc = vi.fn();
const serviceRpc = vi.fn();
let row: Record<string, unknown> | null = null;
vi.mock('../../db', () => ({
  serviceDb: () => ({
    rpc: serviceRpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
  }),
}));
vi.mock('./http', async (orig) => ({
  ...(await orig<typeof import('./http')>()),
  userDb: () => ({ rpc: userRpc }),
}));

const { default: edit, coverFlags } = await import('./staff-edit');

const STAFF = '0a1b2c3d-0000-4000-a000-000000000002';
const BOOK = '0a1b2c3d-0000-4000-c000-000000000001';
const BASE = '0a1b2c3d-0000-4000-d000-000000000001';
const REV = '0a1b2c3d-0000-4000-d000-000000000002';

/** A PNG header with the given size (imageSize reads the IHDR chunk). */
function png(width: number, height: number) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

const objects = new Map<string, Uint8Array>();
const env = {
  UPLOAD_SIGNING_KEY: 'test-signing-key-test-signing-key',
  BOOKS: {
    get: async (key: string) => {
      const b = objects.get(key);
      return b
        ? {
            body: b,
            httpMetadata: {},
            arrayBuffer: async () => b.slice().buffer,
            json: async () => JSON.parse(new TextDecoder().decode(b)),
            checksums: { sha256: new Uint8Array(32).fill(0xab).buffer },
          }
        : null;
    },
    put: async (key: string, body: Uint8Array) => void objects.set(key, body),
    delete: async (key: string) => void objects.delete(key),
    list: async ({ prefix }: { prefix: string }) => ({
      objects: [...objects.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })),
      truncated: false,
    }),
  },
} as unknown as Env;

const app = new Hono<AppEnv>();
app.use('*', async (c, next) => {
  c.set('user', { sub: STAFF } as AppEnv['Variables']['user']);
  await next();
});
app.route('/', edit);
const post = (path: string, body: unknown) =>
  app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }, env, {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext);

const draft = (cover: boolean) => ({
  id: REV,
  status: 'draft',
  staff_edit: { fields: cover ? [] : ['title'], cover },
  uploaded_by: STAFF,
  base_revision_id: BASE,
  work_version: 3,
  cover_key: cover ? `src/${REV}/cover` : `src/${BASE}/cover`,
});

beforeEach(() => {
  userRpc.mockReset();
  serviceRpc.mockReset();
  objects.clear();
  row = null;
});

describe('coverFlags', () => {
  it('passes a sharp 2:3 cover', () => expect(coverFlags(png(1600, 2560))).toEqual([]));
  it('flags a small or oddly shaped cover', () =>
    expect(coverFlags(png(600, 600))!.map((f) => f.check_key)).toEqual(['cover_too_small', 'cover_aspect']));
  it('refuses bytes that are not a JPG or PNG', () =>
    expect(coverFlags(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull());
});

describe('POST /v1/books/staff-edit', () => {
  it('edits details: copies the working copy and routes to review at once', async () => {
    userRpc.mockResolvedValue({ data: { revision_id: REV, revision_no: 2, cover_key: null }, error: null });
    serviceRpc.mockResolvedValue({ data: { revision_id: REV, status: 'ready_for_review' }, error: null });
    row = draft(false);
    objects.set(`work/${BASE}/v3/book.json`, new TextEncoder().encode('{"chapters":[],"imagesFrom":1}'));
    objects.set(`work/${BASE}/v1/img/a.png`, png(10, 10));
    objects.set(`work/${BASE}/v2/old.json`, new Uint8Array([1]));
    const res = await post('/', { book_id: BOOK, meta: { title: 'New' }, note: 'Typo' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revision_id: REV, status: 'ready_for_review' });
    expect(userRpc).toHaveBeenCalledWith('staff_revise_book', {
      p_book: BOOK,
      p_meta: { title: 'New' },
      p_cover: false,
      p_note: 'Typo',
    });
    expect(objects.has(`work/${REV}/v3/book.json`)).toBe(true);
    expect(objects.has(`work/${REV}/v1/img/a.png`)).toBe(true);
    expect(objects.has(`work/${REV}/v2/old.json`)).toBe(false);
    expect(serviceRpc).toHaveBeenCalledWith('complete_staff_revision', { p_rev: REV, p_actor: STAFF });
  });

  it('replace cover: returns a signed upload link and waits for the cover', async () => {
    userRpc.mockResolvedValue({ data: { revision_id: REV, revision_no: 2, cover_key: `src/${REV}/cover` }, error: null });
    const res = await post('/', { book_id: BOOK, cover: true });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { upload: string; status: string };
    expect(json.status).toBe('draft');
    expect(json.upload).toContain('/v1/books/objects/');
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it('passes database refusals through as HTTP statuses', async () => {
    userRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'staff_revise_book: staff only' } });
    expect((await post('/', { book_id: BOOK, meta: { title: 'X' } })).status).toBe(403);
    userRpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'another revision is open' } });
    expect((await post('/', { book_id: BOOK, meta: { title: 'X' } })).status).toBe(409);
  });

  it('refuses unknown fields and bad ids before the database', async () => {
    expect((await post('/', { book_id: BOOK, meta: { source_key: 'x' } })).status).toBe(400);
    expect((await post('/', { book_id: 'nope', meta: {} })).status).toBe(400);
    expect(userRpc).not.toHaveBeenCalled();
  });
});

describe('POST /v1/books/staff-edit/finish', () => {
  it('checks the uploaded cover and sends its flags with the hash', async () => {
    row = draft(true);
    objects.set(`src/${REV}/cover`, png(600, 900));
    serviceRpc.mockResolvedValue({ data: { revision_id: REV, status: 'ready_for_review' }, error: null });
    const res = await post('/finish', { revision_id: REV });
    expect(res.status).toBe(200);
    expect(serviceRpc).toHaveBeenCalledWith('complete_staff_revision', {
      p_rev: REV,
      p_actor: STAFF,
      p_cover: {
        sha256: 'ab'.repeat(32),
        flags: [expect.objectContaining({ check_key: 'cover_too_small' })],
      },
    });
  });

  it('asks again when the cover never arrived', async () => {
    row = draft(true);
    expect((await post('/finish', { revision_id: REV })).status).toBe(409);
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it('deletes and refuses a cover that is not an image', async () => {
    row = draft(true);
    objects.set(`src/${REV}/cover`, new TextEncoder().encode('<html>'));
    expect((await post('/finish', { revision_id: REV })).status).toBe(400);
    expect(objects.has(`src/${REV}/cover`)).toBe(false);
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("is not found for someone else's edit, and a no-op once routed", async () => {
    row = { ...draft(false), uploaded_by: '0a1b2c3d-0000-4000-a000-000000000009' };
    expect((await post('/finish', { revision_id: REV })).status).toBe(404);
    row = { ...draft(false), status: 'ready_for_review' };
    expect(await (await post('/finish', { revision_id: REV })).json()).toEqual({
      revision_id: REV,
      status: 'ready_for_review',
      duplicate: true,
    });
    expect(serviceRpc).not.toHaveBeenCalled();
  });
});
