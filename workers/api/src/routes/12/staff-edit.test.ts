import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv, Env } from '../../env';
import { signUpload } from './tokens';

const STAFF = '0a1b2c3d-0000-4000-a000-000000000002';
const BOOK = '0a1b2c3d-0000-4000-c000-000000000001';
const BASE = '0a1b2c3d-0000-4000-d000-000000000001';
const NEW = '0a1b2c3d-0000-4000-d000-0000000000a1';
const KEY = 'test-signing-key-test-signing-key';

// The database as the Worker's service client sees it.
const db = {
  roles: [{ role: 'publisher' }] as { role: string }[],
  book: { status: 'live', current_revision_id: BASE } as Record<string, unknown> | null,
  open: 0,
  existing: 0,
  base: { id: BASE, work_version: 4, sealed_work_version: 3 },
};
const rpc = vi.fn();
function query(table: string) {
  let open = false;
  const q = {
    select: () => q,
    eq: () => q,
    in: () => ((open = true), q),
    maybeSingle: async () => ({ data: db.book, error: null }),
    single: async () => ({ data: db.base, error: null }),
    then: (ok: (v: unknown) => void) =>
      ok(
        table === 'staff_roles'
          ? { data: db.roles, error: null }
          : { count: open ? db.open : db.existing, data: null, error: null },
      ),
  };
  return q;
}
vi.mock('../../db', () => ({ serviceDb: () => ({ rpc, from: query }) }));

const { default: edit, coverFlags } = await import('./staff-edit');

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
  UPLOAD_SIGNING_KEY: KEY,
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
const post = async (path: string, body: unknown) => {
  const res = await app.request(
    path,
    { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } },
    env,
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};
const coverToken = (k = `src/${NEW}/cover`) =>
  signUpload(KEY, { k, max: 10 * 1024 * 1024, exp: Math.floor(Date.now() / 1000) + 600 });

beforeEach(() => {
  rpc.mockReset();
  objects.clear();
  db.roles = [{ role: 'publisher' }];
  db.book = { status: 'live', current_revision_id: BASE };
  db.open = 0;
  db.existing = 0;
});

describe('coverFlags', () => {
  it('passes a sharp 2:3 cover', () => expect(coverFlags(png(1600, 2560))).toEqual([]));
  it('flags a small or oddly shaped cover', () =>
    expect(coverFlags(png(600, 600))!.map((f) => f.check_key)).toEqual(['cover_too_small', 'cover_aspect']));
  it('refuses bytes that are not a JPG or PNG', () =>
    expect(coverFlags(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull());
});

describe('POST /v1/books/staff-edit (details)', () => {
  it('copies the sealed working copy under a new id, then saves the revision', async () => {
    rpc.mockImplementation(async (_fn: string, a: { p_rev: string }) => ({
      data: { revision_id: a.p_rev, revision_no: 2, status: 'ready_for_review' },
      error: null,
    }));
    objects.set(`work/${BASE}/v3/book.json`, new TextEncoder().encode('{"chapters":[],"imagesFrom":1}'));
    objects.set(`work/${BASE}/v1/img/a.png`, png(10, 10));
    objects.set(`work/${BASE}/v4/book.json`, new TextEncoder().encode('{"chapters":[]}'));
    const res = await post('/', { book_id: BOOK, meta: { title: 'New' }, note: 'Typo' });
    expect(res.status).toBe(200);
    expect(res.json.status).toBe('ready_for_review');
    const id = res.json.revision_id as string;
    expect(rpc).toHaveBeenCalledWith('staff_revise_book', {
      p_rev: id,
      p_book: BOOK,
      p_meta: { title: 'New' },
      p_actor: STAFF,
      p_note: 'Typo',
    });
    expect(objects.has(`work/${id}/v3/book.json`)).toBe(true);
    expect(objects.has(`work/${id}/v1/img/a.png`)).toBe(true);
    // Only the sealed version and its images, not a later unsealed one.
    expect(objects.has(`work/${id}/v4/book.json`)).toBe(false);
  });

  it('copies nothing when the database would refuse', async () => {
    objects.set(`work/${BASE}/v3/book.json`, new TextEncoder().encode('{"chapters":[]}'));
    const size = objects.size;
    db.roles = [];
    expect((await post('/', { book_id: BOOK, meta: { title: 'X' } })).status).toBe(403);
    db.roles = [{ role: 'publisher' }];
    db.open = 1;
    expect((await post('/', { book_id: BOOK, meta: { title: 'X' } })).status).toBe(409);
    db.open = 0;
    db.book = { status: 'unpublished', current_revision_id: BASE };
    expect((await post('/', { book_id: BOOK, meta: { title: 'X' } })).status).toBe(409);
    db.book = null;
    expect((await post('/', { book_id: BOOK, meta: { title: 'X' } })).status).toBe(404);
    expect(objects.size).toBe(size);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes database refusals through as HTTP statuses', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'staff_revise_book: nothing changed' },
    });
    expect((await post('/', { book_id: BOOK, meta: { title: 'Same' } })).status).toBe(400);
  });

  it('refuses unknown fields, an empty genre list and bad ids before the database', async () => {
    expect((await post('/', { book_id: BOOK, meta: { source_key: 'x' } })).status).toBe(400);
    expect((await post('/', { book_id: BOOK, meta: { genres: [] } })).status).toBe(400);
    expect((await post('/', { book_id: 'nope', meta: {} })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('Replace cover', () => {
  it('POST /cover gives a signed upload link and token; nothing is saved yet', async () => {
    const res = await post('/cover', { book_id: BOOK });
    expect(res.status).toBe(200);
    expect(res.json.upload).toContain(`/v1/books/objects/${res.json.cover_token as string}`);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('saves with the cover hash and flags, under the id in the token', async () => {
    objects.set(`src/${NEW}/cover`, png(600, 900));
    rpc.mockResolvedValue({
      data: { revision_id: NEW, revision_no: 2, status: 'ready_for_review' },
      error: null,
    });
    const res = await post('/', { book_id: BOOK, cover_token: await coverToken() });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('staff_revise_book', {
      p_rev: NEW,
      p_book: BOOK,
      p_meta: {},
      p_actor: STAFF,
      p_cover: {
        sha256: 'ab'.repeat(32),
        flags: [expect.objectContaining({ check_key: 'cover_too_small' })],
      },
    });
  });

  it('refuses a forged or foreign token, and one already saved', async () => {
    objects.set(`src/${NEW}/cover`, png(1600, 2560));
    expect((await post('/', { book_id: BOOK, cover_token: 'forged.token' })).status).toBe(409);
    expect(
      (await post('/', { book_id: BOOK, cover_token: await coverToken(`work/${NEW}/v1/x`) })).status,
    ).toBe(409);
    db.existing = 1;
    expect((await post('/', { book_id: BOOK, cover_token: await coverToken() })).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('asks again when the cover never arrived', async () => {
    expect((await post('/', { book_id: BOOK, cover_token: await coverToken() })).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('deletes and refuses a cover that is not an image', async () => {
    objects.set(`src/${NEW}/cover`, new TextEncoder().encode('<html>'));
    expect((await post('/', { book_id: BOOK, cover_token: await coverToken() })).status).toBe(400);
    expect(objects.has(`src/${NEW}/cover`)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
